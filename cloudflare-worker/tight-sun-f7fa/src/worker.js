/**
 * Cloudflare Worker — 通用 AI API 反向代理
 *
 * 支援 NovelAI、OpenAI、Claude、OpenRouter 等任何 HTTPS API
 *
 * 部署方式：
 * 1. Cloudflare Dashboard → Workers & Pages → Create Worker
 * 2. 貼上此腳本，部署
 * 3. 設定自訂域名（例如 nai-proxy.aguacloud.uk）
 *    Workers → 你的 Worker → Settings → Triggers → Custom Domains
 *
 * 路由規則：
 *   /nai/ai/generate-image     → https://image.novelai.net/ai/generate-image
 *   /nai/user/subscription     → https://api.novelai.net/user/subscription
 *   /proxy/{host}/{path}       → https://{host}/{path}  （通用代理）
 *   /image-proxy?url={url}     → 圖片代理（支援任意圖片 URL）
 *
 * 安全：只允許白名單 Origin 呼叫
 */

// ── 設定 ──────────────────────────────────────────────────────

/** 允許的 Origin（改成你自己的域名） */
const ALLOWED_ORIGINS = [
	'https://203aguaphone.aguacloud.uk',
	'http://203aguaphone.aguacloud.uk',
	'http://localhost:5173',
	'http://localhost:3002',
];

/** 只轉發這些 headers 給上游，避免洩漏 Cloudflare / 瀏覽器特有的 headers */
const FORWARD_HEADERS = [
	'authorization',
	'content-type',
	'accept',
	'x-api-key',
	'anthropic-version',
	'content-length',
	// 可讓前端標記來源，方便你在 Worker log/除錯時辨識（不影響上游）
	'x-aguaphone-client',
];

/** 偽裝的 User-Agent（瀏覽器 fetch 無法覆蓋 User-Agent，所以由 Worker 來設定） */
const NAI_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ── 工具 ──────────────────────────────────────────────────────

function corsHeaders(origin) {
	const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
	return {
		'Access-Control-Allow-Origin': allowed,
		'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
		'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Api-Key, Anthropic-Version, X-Aguaphone-Client',
		'Access-Control-Max-Age': '86400',
	};
}

function isOriginAllowed(origin) {
	return !origin || ALLOWED_ORIGINS.includes(origin);
}

function withCors(response, origin) {
	const h = new Headers(response.headers);
	for (const [k, v] of Object.entries(corsHeaders(origin))) {
		h.set(k, v);
	}
	// 讓前端可以讀到診斷 header（iOS WebView 常常讀不到 cf-ray/server 等）
	h.set('Access-Control-Expose-Headers', 'server,cf-ray,cf-cache-status,via,x-upstream-status,x-upstream-host');
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: h,
	});
}

/**
 * 建立乾淨的上游 headers，只保留白名單中的 headers
 * 避免轉發 CF-Connecting-IP、CF-Ray、CF-Worker 等 Cloudflare 注入的 headers
 */
function buildUpstreamHeaders(request, targetHost, bodyLength) {
	const clean = new Headers();

	// 只複製白名單中的 headers
	for (const name of FORWARD_HEADERS) {
		const value = request.headers.get(name);
		if (value) {
			clean.set(name, value);
		}
	}

	// 設定正確的 Host
	clean.set('Host', targetHost);

	// 設定偽裝的 User-Agent（瀏覽器無法在 fetch 中覆寫 User-Agent，由 Worker 統一處理）
	clean.set('User-Agent', NAI_USER_AGENT);

	// 偽裝 Origin 和 Referer
	if (targetHost === 'image.novelai.net') {
		clean.set('Origin', 'https://novelai.net');
		clean.set('Referer', 'https://novelai.net/');
	} else if (targetHost === 'api.novelai.net') {
		clean.set('Origin', 'https://api.novelai.net');
		clean.set('Referer', 'https://api.novelai.net/');
	}

	// 確保有 Accept header
	if (!clean.has('accept')) {
		clean.set('Accept', '*/*');
	}

	// 設定正確的 Content-Length（避免 chunked transfer 導致上游拒絕）
	if (bodyLength != null && bodyLength > 0) {
		clean.set('Content-Length', String(bodyLength));
	}

	// 移除可能被自動加入的 Accept-Encoding（避免壓縮問題）
	clean.delete('accept-encoding');

	// 明確移除可能暴露代理身份的 headers
	clean.delete('cf-connecting-ip');
	clean.delete('cf-ray');
	clean.delete('cf-visitor');
	clean.delete('cf-ipcountry');
	clean.delete('x-forwarded-for');
	clean.delete('x-forwarded-proto');
	clean.delete('x-real-ip');
	clean.delete('true-client-ip');

	return clean;
}

/**
 * 帶重試的上游 fetch（處理 503 等暫時性錯誤）
 */
async function fetchUpstreamWithRetry(upstream, init, maxRetries = 3) {
	let lastResponse = null;
	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			const response = await fetch(upstream, init);
			if (response.ok || (response.status < 500 && response.status !== 429)) {
				return response;
			}
			lastResponse = response;

			// 429 或 5xx 重試，使用遞增等待時間
			if (attempt < maxRetries) {
				let waitMs;
				if (response.status === 429) {
					waitMs = 10000 * (attempt + 1);
				} else if (response.status === 503) {
					waitMs = 8000 * (attempt + 1);
				} else {
					waitMs = 5000 * (attempt + 1);
				}
				console.log(`[Retry] Status ${response.status}, waiting ${waitMs}ms before retry ${attempt + 1}/${maxRetries}`);
				await new Promise((r) => setTimeout(r, waitMs));
				continue;
			}
		} catch (err) {
			if (attempt < maxRetries) {
				const waitMs = 3000 * (attempt + 1);
				console.log(`[Retry] Network error, waiting ${waitMs}ms before retry ${attempt + 1}/${maxRetries}`);
				await new Promise((r) => setTimeout(r, waitMs));
				continue;
			}
			throw err;
		}
	}
	return lastResponse;
}

// ── 圖片代理處理 ──────────────────────────────────────────────

async function handleImageProxy(request, url, origin) {
	const targetUrl = url.searchParams.get('url');

	if (!targetUrl) {
		return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
		});
	}

	// 驗證 URL 格式
	let parsedUrl;
	try {
		parsedUrl = new URL(targetUrl);
		if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
			throw new Error('Invalid protocol');
		}
	} catch (e) {
		return new Response(JSON.stringify({ error: 'Invalid URL: ' + e.message }), {
			status: 400,
			headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
		});
	}

	try {
		const imageResponse = await fetch(targetUrl, {
			headers: {
				'User-Agent': NAI_USER_AGENT,
				Accept: 'image/*,*/*',
				Referer: parsedUrl.origin + '/',
			},
			cf: {
				cacheTtl: 3600,
				cacheEverything: true,
			},
		});

		if (!imageResponse.ok) {
			return new Response(
				JSON.stringify({
					error: 'Failed to fetch image',
					status: imageResponse.status,
					statusText: imageResponse.statusText,
				}),
				{
					status: imageResponse.status,
					headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
				},
			);
		}

		const responseHeaders = new Headers(imageResponse.headers);
		for (const [k, v] of Object.entries(corsHeaders(origin))) {
			responseHeaders.set(k, v);
		}

		if (!responseHeaders.has('Content-Type')) {
			const contentType = imageResponse.headers.get('Content-Type') || 'image/jpeg';
			responseHeaders.set('Content-Type', contentType);
		}

		responseHeaders.set('Cache-Control', 'public, max-age=3600');
		responseHeaders.set('Access-Control-Expose-Headers', 'server,cf-ray,cf-cache-status,via,x-upstream-status,x-upstream-host');

		return new Response(imageResponse.body, {
			status: imageResponse.status,
			statusText: imageResponse.statusText,
			headers: responseHeaders,
		});
	} catch (err) {
		return new Response(
			JSON.stringify({
				error: 'Image proxy error: ' + err.message,
				targetUrl: targetUrl,
			}),
			{
				status: 502,
				headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
			},
		);
	}
}

// ── 主處理 ────────────────────────────────────────────────────

async function handleRequest(request) {
	const url = new URL(request.url);
	const origin = request.headers.get('Origin') || '';

	// CORS preflight
	if (request.method === 'OPTIONS') {
		return new Response(null, { status: 204, headers: corsHeaders(origin) });
	}

	// Origin 檢查
	if (!isOriginAllowed(origin)) {
		return new Response('Forbidden', { status: 403 });
	}

	const path = url.pathname;

	// ── 圖片代理路由 ──
	if (path === '/image-proxy') {
		return handleImageProxy(request, url, origin);
	}

	let upstream;
	let targetHost;

	// ── NovelAI 專用路由 ──
	if (path.startsWith('/nai/ai/')) {
		targetHost = 'image.novelai.net';
		upstream = 'https://' + targetHost + path.slice(4); // 去掉 /nai
	} else if (path.startsWith('/nai/user/')) {
		targetHost = 'api.novelai.net';
		upstream = 'https://' + targetHost + path.slice(4);
	}
	// ── 通用代理路由：/proxy/{host}/{path} ──
	else if (path.startsWith('/proxy/')) {
		const rest = path.slice(7); // 去掉 /proxy/
		const slashIdx = rest.indexOf('/');
		if (slashIdx === -1) {
			return new Response('Bad Request: missing path after host', { status: 400 });
		}
		targetHost = rest.slice(0, slashIdx);
		const targetPath = rest.slice(slashIdx);
		upstream = `https://${targetHost}${targetPath}`;
	} else {
		return new Response('Not Found', { status: 404 });
	}

	// 讀取 body（先完整讀取再轉發，避免 stream 斷裂導致上游 503）
	let body = null;
	let bodyLength = 0;
	if (request.method !== 'GET' && request.method !== 'HEAD') {
		try {
			body = await request.arrayBuffer();
			bodyLength = body.byteLength;
		} catch (e) {
			return new Response(JSON.stringify({ error: 'Failed to read request body: ' + e.message }), {
				status: 400,
				headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
			});
		}
	}

	const upstreamHeaders = buildUpstreamHeaders(request, targetHost, bodyLength);

	try {
		const isNAI = targetHost.includes('novelai.net');

		const upstreamResponse = await fetchUpstreamWithRetry(
			upstream,
			{
				method: request.method,
				headers: upstreamHeaders,
				body: body,
				...(isNAI && {
					cf: {
						cacheTtl: 0,
						cacheEverything: false,
						mirage: false,
						polish: 'off',
						minify: { javascript: false, css: false, html: false },
					},
				}),
			},
			isNAI ? 2 : 1,
		);

		const responseHeaders = new Headers(upstreamResponse.headers);
		for (const [k, v] of Object.entries(corsHeaders(origin))) {
			responseHeaders.set(k, v);
		}

		// 診斷用：讓前端可區分 503 來源
		responseHeaders.set('X-Upstream-Status', String(upstreamResponse.status));
		responseHeaders.set('X-Upstream-Host', targetHost);
		responseHeaders.set('Access-Control-Expose-Headers', 'server,cf-ray,cf-cache-status,via,x-upstream-status,x-upstream-host');

		// 如果是 503 且已重試失敗，加入診斷資訊（JSON 回應）
		if (upstreamResponse.status === 503) {
			const body503 = await upstreamResponse.text().catch(() => '');
			const errorLabel = isNAI ? 'NovelAI 服務暫時不可用 (503)' : `${targetHost} 暫時不可用 (503)`;
			const resp = new Response(
				JSON.stringify({
					error: errorLabel,
					upstream_status: 503,
					upstream_body: body503.slice(0, 500),
					debug: {
						target: upstream,
						method: request.method,
						bodySize: bodyLength,
						timestamp: new Date().toISOString(),
					},
				}),
				{
					status: 503,
					headers: {
						'Content-Type': 'application/json',
						...Object.fromEntries(responseHeaders.entries()),
					},
				},
			);
			return resp;
		}

		return new Response(upstreamResponse.body, {
			status: upstreamResponse.status,
			statusText: upstreamResponse.statusText,
			headers: responseHeaders,
		});
	} catch (err) {
		const resp = new Response(JSON.stringify({ error: err.message }), {
			status: 502,
			headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
		});
		return withCors(resp, origin);
	}
}

export default {
	fetch: handleRequest,
};

addEventListener('fetch', (event) => {
	event.respondWith(handleRequest(event.request));
});
