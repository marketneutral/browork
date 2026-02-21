import { describe, it, expect } from "vitest";
import { translatePiEvent } from "../utils/event-translator.js";

describe("translatePiEvent", () => {
  it("translates agent_start", () => {
    expect(translatePiEvent({ type: "agent_start" })).toEqual({
      type: "agent_start",
    });
  });

  it("translates agent_end", () => {
    expect(translatePiEvent({ type: "agent_end", messages: [] })).toEqual({
      type: "agent_end",
    });
  });

  it("translates message_end", () => {
    expect(translatePiEvent({ type: "message_end", message: {} })).toEqual({
      type: "message_end",
    });
  });

  it("translates message_update with text_delta", () => {
    const event = {
      type: "message_update",
      message: {},
      assistantMessageEvent: { type: "text_delta", delta: "Hello" },
    };
    expect(translatePiEvent(event)).toEqual({
      type: "message_delta",
      text: "Hello",
    });
  });

  it("returns null for message_update without text_delta", () => {
    const event = {
      type: "message_update",
      message: {},
      assistantMessageEvent: { type: "thinking_delta", delta: "..." },
    };
    expect(translatePiEvent(event)).toBeNull();
  });

  it("returns null for message_update with no assistantMessageEvent", () => {
    expect(translatePiEvent({ type: "message_update", message: {} })).toBeNull();
  });

  it("translates tool_execution_start", () => {
    const event = {
      type: "tool_execution_start",
      toolCallId: "tc-1",
      toolName: "read",
      args: { path: "data.csv" },
    };
    expect(translatePiEvent(event)).toEqual({
      type: "tool_start",
      tool: "read",
      args: { path: "data.csv" },
    });
  });

  it("translates tool_execution_end", () => {
    const event = {
      type: "tool_execution_end",
      toolCallId: "tc-1",
      toolName: "read",
      result: "file contents...",
      isError: false,
    };
    expect(translatePiEvent(event)).toEqual({
      type: "tool_end",
      tool: "read",
      result: "file contents...",
      isError: false,
    });
  });

  it("translates tool_execution_end with error", () => {
    const event = {
      type: "tool_execution_end",
      toolCallId: "tc-2",
      toolName: "bash",
      result: "command not found",
      isError: true,
    };
    expect(translatePiEvent(event)).toEqual({
      type: "tool_end",
      tool: "bash",
      result: "command not found",
      isError: true,
    });
  });

  it("returns null for unknown event types", () => {
    expect(translatePiEvent({ type: "turn_start" })).toBeNull();
    expect(translatePiEvent({ type: "auto_compaction_start" })).toBeNull();
    expect(translatePiEvent({ type: "auto_retry_start" })).toBeNull();
  });
});
