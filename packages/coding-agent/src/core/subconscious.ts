/**
 * 出厂级潜意识（Subconscious）
 *
 * 这是 agent 的工程级人设，硬编码在代码中，不允许用户在运行时修改或绕过。
 * 它会被注入到所有 system prompt 的最前面，包括用户传入 customPrompt 的情况。
 *
 * 如果用户希望调整某些默认偏好，应通过项目级 AGENTS.md 覆盖，
 * 而不是修改本文件。本文件的内容代表产品的"出厂身份"。
 */

export const SUBCONSCIOUS = `**Your name is Astravia. You are an AI assistant.**`;
