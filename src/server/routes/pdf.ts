import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import fs from "node:fs/promises";
import { pdfs, selections, chatMessages } from "../db/schema";
import { openPdf, getPdf } from "../services/pdfService";

import { buildSystemPrompt, streamChatCompletion } from "../services/deepseekService";
import { buildMessages, parseCitations } from "../services/chatService";

type Env = {
  Bindings: {
    DB: D1Database;
    DEEPSEEK_API_KEY: string;
  };
};

export const pdfRoute = new Hono<Env>()
  .post("/pdf/open", async (c) => {
    const formData = await c.req.parseBody().catch(() => null);
    if (!formData) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Invalid form body" } }, 400);
    }

    const file = formData.file;
    if (!file || !(file instanceof File)) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "No PDF file provided" } }, 400);
    }

    const fullText = String(formData.fullText ?? "");
    const pageCount = parseInt(String(formData.pageCount ?? "0"), 10);
    if (!fullText || pageCount <= 0) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Missing fullText or pageCount" } }, 400);
    }

    // Compute hash and get binary data
    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
    const fileHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    try {
      const metadata = await openPdf(c.env.DB, {
        fileName: file.name,
        fileHash,
        fullText,
        pageCount,
        arrayBuffer,
      });
      return c.json(metadata);
    } catch (err) {
      console.error("PDF open error:", err);
      return c.json(
        { error: { code: "PDF_EXTRACT_FAILED", message: "Failed to process PDF" } },
        500,
      );
    }
  })
  .get("/pdf/:pdfId/file", async (c) => {
    const pdfId = c.req.param("pdfId");
    const d1Db = drizzle(c.env.DB);
    const pdf = await d1Db.select().from(pdfs).where(eq(pdfs.id, pdfId)).get();
    if (!pdf) {
      return c.json({ error: { code: "PDF_NOT_FOUND", message: "PDF not found" } }, 404);
    }

    // Read file from disk
    try {
      const fileData = await fs.readFile(pdf.filePath);
      return new Response(fileData, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${pdf.fileName}"`,
        },
      });
    } catch {
      return c.json({ error: { code: "PDF_FILE_MISSING", message: "PDF file not found on disk" } }, 404);
    }
  })
  .get("/pdf/:pdfId", async (c) => {
    const pdfId = c.req.param("pdfId");
    const result = await getPdf(c.env.DB, pdfId);

    if (!result) {
      return c.json({ error: { code: "PDF_NOT_FOUND", message: "PDF not found" } }, 404);
    }

    return c.json(result);
  })
  .post("/pdf/:pdfId/selections", async (c) => {
    const pdfId = c.req.param("pdfId");
    const d1Db = drizzle(c.env.DB);

    // Verify pdf exists
    const pdf = await d1Db.select().from(pdfs).where(eq(pdfs.id, pdfId)).get();
    if (!pdf) {
      return c.json({ error: { code: "PDF_NOT_FOUND", message: "PDF not found" } }, 404);
    }

    const body = await c.req.json().catch(() => null);
    if (!body) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Invalid JSON" } }, 400);
    }

    const { selectedText, pageNumber, positionData } = body;
    if (!selectedText || !pageNumber || !positionData) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Missing required fields" } }, 400);
    }

    const id = ulid();
    const now = new Date().toISOString();
    await d1Db.insert(selections).values({
      id,
      pdfId,
      selectedText,
      pageNumber,
      positionData: JSON.stringify(positionData),
      createdAt: now,
    });

    return c.json({ id, selectedText, pageNumber, positionData, createdAt: now }, 201);
  })
  .get("/pdf/:pdfId/selections/:selId/chats", async (c) => {
    const selId = c.req.param("selId");
    const d1Db = drizzle(c.env.DB);

    const sel = await d1Db.select().from(selections).where(eq(selections.id, selId)).get();
    if (!sel) {
      return c.json({ error: { code: "SELECTION_NOT_FOUND", message: "Selection not found" } }, 404);
    }

    const messages = await d1Db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.selectionId, selId))
      .all();

    return c.json({
      selectionId: selId,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        citations: m.citations ? JSON.parse(m.citations) : null,
        createdAt: m.createdAt,
      })),
    });
  })
  .post("/pdf/:pdfId/selections/:selId/chats", async (c) => {
    const selId = c.req.param("selId");
    const d1Db = drizzle(c.env.DB);
    const apiKey = c.env.DEEPSEEK_API_KEY;

    if (!apiKey) {
      return c.json({ error: { code: "CONFIG_ERROR", message: "DEEPSEEK_API_KEY not set" } }, 500);
    }

    const sel = await d1Db.select().from(selections).where(eq(selections.id, selId)).get();
    if (!sel) {
      return c.json({ error: { code: "SELECTION_NOT_FOUND", message: "Selection not found" } }, 404);
    }

    const body = await c.req.json().catch(() => null);
    if (!body) {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Invalid JSON" } }, 400);
    }

    const { content, useWebSearch } = body as { content?: string; useWebSearch?: boolean };
    if (!content || typeof content !== "string") {
      return c.json({ error: { code: "VALIDATION_ERROR", message: "Missing content" } }, 400);
    }

    // Save user message
    const userMsgId = ulid();
    const now = new Date().toISOString();
    await d1Db.insert(chatMessages).values({
      id: userMsgId,
      selectionId: selId,
      role: "user",
      content,
      createdAt: now,
    });

    // Get PDF text for context
    const pdfRow = await d1Db
      .select({ fullText: pdfs.fullText })
      .from(pdfs)
      .where(eq(pdfs.id, sel.pdfId))
      .get();

    if (!pdfRow) {
      return c.json({ error: { code: "PDF_NOT_FOUND", message: "PDF not found" } }, 404);
    }

    // Get chat history
    const history = await d1Db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.selectionId, selId))
      .all();

    // Build system prompt and messages
    const systemPrompt = buildSystemPrompt(pdfRow.fullText, sel.selectedText, !!useWebSearch);
    const messages = buildMessages(systemPrompt, history.map((h) => ({ role: h.role, content: h.content })), content);

    // Set up SSE streaming
    const encoder = new TextEncoder();
    let fullResponse = "";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          await streamChatCompletion(
            apiKey,
            messages,
            {
              onToken(token: string) {
                fullResponse += token;
                controller.enqueue(encoder.encode(`event: token\ndata: ${JSON.stringify({ content: token })}\n\n`));
              },
              onDone(_usage: { inputTokens: number; outputTokens: number }) {
                // Parse citations
                const citations = parseCitations(fullResponse);

                // Send citation events
                for (const citation of citations) {
                  controller.enqueue(
                    encoder.encode(`event: citation\ndata: ${JSON.stringify(citation)}\n\n`),
                  );
                }

                // Save assistant message
                const assistantMsgId = ulid();
                const saveNow = new Date().toISOString();
                // Use queueMicrotask-style approach - save in background
                d1Db.insert(chatMessages).values({
                  id: assistantMsgId,
                  selectionId: selId,
                  role: "assistant",
                  content: fullResponse,
                  citations: JSON.stringify(citations),
                  createdAt: saveNow,
                }).run().catch((err: Error) => console.error("Failed to save assistant message:", err));

                controller.enqueue(
                  encoder.encode(
                    `event: done\ndata: ${JSON.stringify({ messageId: assistantMsgId, usage: _usage })}\n\n`,
                  ),
                );
                controller.close();
              },
              onError(err: Error) {
                controller.enqueue(
                  encoder.encode(`event: error\ndata: ${JSON.stringify({ code: "AI_API_ERROR", message: err.message })}\n\n`),
                );
                controller.close();
              },
            },
          );
        } catch (err) {
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({ code: "AI_STREAM_ERROR", message: String(err) })}\n\n`,
            ),
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  })
  .delete("/pdf/:pdfId/selections/:selId", async (c) => {
    const selId = c.req.param("selId");
    const d1Db = drizzle(c.env.DB);

    await d1Db.delete(selections).where(eq(selections.id, selId));
    return c.json({ deleted: true });
  });
