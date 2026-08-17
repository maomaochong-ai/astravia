/**
 * 数据库能力抽象层（B2.1）领域出口。
 *
 * UI（B2.6 经典界面 / AI 集成）只从这里 import 稳定接口，
 * 不直接触碰 window.astravia.database 或 preload 类型。
 */
export * from "./lib/database-api.js";
