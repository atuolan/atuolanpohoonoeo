#!/usr/bin/env ruby
# 看螢幕模式 第 0 步：把螢幕廣播擴充元件 ScreenWatchBroadcast 加進 Xcode 專案。
# 手改 project.pbxproj 很容易壞，所以用 xcodeproj 套件加 target。可以重跑（已經有就跳過）。
#
#   gem install xcodeproj
#   ruby scripts/ios/add-broadcast-extension.rb

require "xcodeproj"

ROOT = File.expand_path("../..", __dir__)
PROJECT_PATH = File.join(ROOT, "ios/App/App.xcodeproj")
EXT_NAME = "ScreenWatchBroadcast"
EXT_BUNDLE_ID = "uk.aguacloud.aguaphone.ScreenWatch"
DEPLOYMENT_TARGET = "15.0"

project = Xcodeproj::Project.open(PROJECT_PATH)
app_target = project.targets.find { |t| t.name == "App" } or abort "找不到 App target"

if project.targets.any? { |t| t.name == EXT_NAME }
  puts "#{EXT_NAME} 已經在專案裡，跳過"
  exit 0
end

# App 跟擴充元件用同一個版本號
app_release = app_target.build_configuration_list["Release"].build_settings
marketing_version = app_release["MARKETING_VERSION"] || "1.0"
build_version = app_release["CURRENT_PROJECT_VERSION"] || "1"

ext_target = project.new_target(:app_extension, EXT_NAME, :ios, DEPLOYMENT_TARGET, nil, :swift)

# 檔案群組
group = project.main_group.find_subpath(EXT_NAME, true)
group.set_source_tree("<group>")
group.set_path(EXT_NAME)
handler_ref = group.new_reference("SampleHandler.swift")
group.new_reference("Info.plist")
group.new_reference("#{EXT_NAME}.entitlements")
ext_target.add_file_references([handler_ref])

# 不手動連結系統框架：Swift `import ReplayKit` 會自動連結。
# xcodeproj 加的框架路徑會寫死 SDK 版本（iPhoneOSxx.x.sdk），換 Xcode 就找不到，所以把它預設加的也拿掉。
ext_target.frameworks_build_phase.files.dup.each do |bf|
  ref = bf.file_ref
  bf.remove_from_project
  ref&.remove_from_project
end
frameworks_group = project.main_group["Frameworks"]
if frameworks_group
  frameworks_group.recursive_children.select { |c| c.is_a?(Xcodeproj::Project::Object::PBXGroup) && c.children.empty? }.each(&:remove_from_project)
  frameworks_group.remove_from_project if frameworks_group.children.empty?
end

ext_target.build_configurations.each do |config|
  s = config.build_settings
  s["PRODUCT_NAME"] = "$(TARGET_NAME)"
  s["PRODUCT_BUNDLE_IDENTIFIER"] = EXT_BUNDLE_ID
  s["INFOPLIST_FILE"] = "#{EXT_NAME}/Info.plist"
  s["CODE_SIGN_ENTITLEMENTS"] = "#{EXT_NAME}/#{EXT_NAME}.entitlements"
  s["CODE_SIGN_STYLE"] = "Automatic"
  s["IPHONEOS_DEPLOYMENT_TARGET"] = DEPLOYMENT_TARGET
  s["SWIFT_VERSION"] = "5.0"
  s["TARGETED_DEVICE_FAMILY"] = "1,2"
  s["MARKETING_VERSION"] = marketing_version
  s["CURRENT_PROJECT_VERSION"] = build_version
  s["SKIP_INSTALL"] = "YES"
  s["LD_RUNPATH_SEARCH_PATHS"] = ["$(inherited)", "@executable_path/Frameworks", "@executable_path/../../Frameworks"]
  s["APPLICATION_EXTENSION_API_ONLY"] = "YES"
end

# App 也要 App Group
app_target.build_configurations.each do |config|
  config.build_settings["CODE_SIGN_ENTITLEMENTS"] = "App/App.entitlements"
end
app_group = project.main_group.find_subpath("App", false)
if app_group && app_group.files.none? { |f| f.path == "App.entitlements" }
  app_group.new_reference("App.entitlements")
end

# 先編擴充元件，再把 .appex 放進 App.app/PlugIns/
app_target.add_dependency(ext_target)
embed = app_target.copy_files_build_phases.find { |p| p.name == "Embed Foundation Extensions" } ||
        app_target.new_copy_files_build_phase("Embed Foundation Extensions")
embed.symbol_dst_subfolder_spec = :plug_ins
embed.dst_path = ""
build_file = embed.add_file_reference(ext_target.product_reference, true)
build_file.settings = { "ATTRIBUTES" => ["RemoveHeadersOnCopy"] }

project.save
puts "已加入 #{EXT_NAME}（#{EXT_BUNDLE_ID}）"
