// lunar-javascript 沒附型別，只宣告六爻用到的部分
declare module "lunar-javascript" {
  export class Lunar {
    getYearInGanZhiExact(): string;
    getMonthInGanZhiExact(): string;
    getDayInGanZhiExact(): string;
    getTimeInGanZhi(): string;
    getDayXunKongExact(): string;
    getMonthZhiExact(): string;
    getDayGanExact(): string;
    getDayZhiExact(): string;
    getMonthInChinese(): string;
    getDayInChinese(): string;
    getTimeZhi(): string;
  }
  export class Solar {
    static fromDate(date: Date): Solar;
    static fromYmdHms(y: number, m: number, d: number, h: number, mi: number, s: number): Solar;
    getLunar(): Lunar;
  }
}
