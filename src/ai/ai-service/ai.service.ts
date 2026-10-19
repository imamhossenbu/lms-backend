import { Injectable, Logger, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma/prisma.service";
import axios from "axios";
import { Response } from "express";
import {
  AskTutorDto,
  GenerateQuizDto,
  GenerateCourseOutlineDto,
  EvaluateAssignmentDto,
  SummarizeLessonDto,
  GenerateFlashcardsDto,
} from "./dto/ai.dto";

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private geminiApiKey: string;
  private groqApiKey: string;
  private geminiModel = "gemini-3.8-flash";

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    this.geminiApiKey =
      this.configService.get<string>("GEMINI_API_KEY") || "";
    this.groqApiKey = this.configService.get<string>("GROQ_API_KEY") || "";
  }

  /**
   * Core text generation with Gemini (falls back to Groq if needed)
   */
  async generateText(
    prompt: string,
    systemInstruction?: string,
    jsonMode = false,
  ): Promise<string> {
    if (this.geminiApiKey) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.geminiModel}:generateContent?key=${this.geminiApiKey}`;

        const payload: Record<string, any> = {
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 8192,
          },
        };

        if (systemInstruction) {
          payload.systemInstruction = {
            parts: [{ text: systemInstruction }],
          };
        }

        if (jsonMode) {
          payload.generationConfig.responseMimeType = "application/json";
        }

        const response = await axios.post(url, payload, {
          headers: { "Content-Type": "application/json" },
          timeout: 30000,
        });

        const text =
          response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text.trim();
      } catch (err: any) {
        this.logger.warn(
          `Gemini API failed: ${err?.response?.data?.error?.message || err.message}. Attempting Groq fallback...`,
        );
      }
    }

    // Fallback: Groq API
    if (this.groqApiKey) {
      const groqModels = ["qwen/qwen3.8-27b", "openai/gpt-oss-20b", "openai/gpt-oss-120b"];
      for (const model of groqModels) {
        try {
          const messages: any[] = [];
          if (systemInstruction) {
            messages.push({ role: "system", content: systemInstruction });
          }
          messages.push({ role: "user", content: prompt });

          const response = await axios.post(
            "https://api.groq.com/openai/v1/chat/completions",
            {
              model,
              messages,
              temperature: 0.7,
              max_tokens: 2048,
              ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
            },
            {
              headers: {
                Authorization: `Bearer ${this.groqApiKey}`,
                "Content-Type": "application/json",
              },
              timeout: 30000,
            },
          );

          const text = response.data?.choices?.[0]?.message?.content;
          if (text) return text.trim();
        } catch (err: any) {
          this.logger.warn(
            `Groq API model ${model} failed: ${err?.response?.data?.error?.message || err.message}. Trying next fallback...`,
          );
        }
      }
    }

    throw new InternalServerErrorException(
      "AI Service is currently unavailable. Please verify API keys.",
    );
  }

  /**
   * Helper to build curriculum context from course and lesson IDs
   */
  private async buildCurriculumContext(courseId?: string, lessonId?: string): Promise<string> {
    let context = "";

    if (courseId) {
      const course = await this.prisma.course.findUnique({
        where: { id: courseId },
        select: { title: true, description: true },
      });
      if (course) {
        context += `Course: "${course.title}". Course Overview: ${course.description}\n`;
      }
    }

    if (lessonId) {
      const lesson = await this.prisma.lesson.findUnique({
        where: { id: lessonId },
        select: { title: true, content: true },
      });
      if (lesson) {
        context += `Lesson: "${lesson.title}". Lesson Content: ${lesson.content || "N/A"}\n`;
      }
    }

    return context;
  }

  /**
   * Standard AI Tutor / Doubt Solver for students
   */
  async askTutor(dto: AskTutorDto) {
    const context = await this.buildCurriculumContext(dto.courseId, dto.lessonId);

    const systemInstruction = `You are a supportive, encouraging, and knowledgeable AI Tutor on the LMS Platform. 
Your goal is to help students understand concepts deeply, clarify doubts, and provide clear step-by-step explanations.
${context ? `Use the following curriculum context when answering:\n${context}` : ""}
Be clear, accurate, and format responses with clean markdown when helpful.`;

    const answer = await this.generateText(dto.message, systemInstruction, false);

    return {
      answer,
      timestamp: new Date(),
    };
  }

  /**
   * Real-time Streaming AI Tutor Chat (SSE - Server-Sent Events)
   */
  async streamTutorChat(dto: AskTutorDto, res: Response): Promise<void> {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    const context = await this.buildCurriculumContext(dto.courseId, dto.lessonId);

    const systemInstruction = `You are a supportive, encouraging, and knowledgeable AI Tutor on the LMS Platform. 
Your goal is to help students understand concepts deeply, clarify doubts, and provide clear step-by-step explanations.
${context ? `Use the following curriculum context when answering:\n${context}` : ""}
Be clear, accurate, and format responses with clean markdown when helpful.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.geminiModel}:streamGenerateContent?alt=sse&key=${this.geminiApiKey}`;

    try {
      const response = await axios.post(
        url,
        {
          contents: [{ role: "user", parts: [{ text: dto.message }] }],
          systemInstruction: { parts: [{ text: systemInstruction }] },
          generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
        },
        {
          headers: { "Content-Type": "application/json" },
          responseType: "stream",
          timeout: 45000,
        },
      );

      let buffer = "";

      response.data.on("data", (chunk: Buffer) => {
        buffer += chunk.toString("utf8");
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data:")) {
            const jsonStr = trimmed.replace("data:", "").trim();
            if (!jsonStr) continue;

            try {
              const parsed = JSON.parse(jsonStr);
              const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
              if (text) {
                res.write(`data: ${JSON.stringify({ text })}\n\n`);
              }
            } catch {
              // Ignore non-json or incomplete chunks
            }
          }
        }
      });

      response.data.on("end", () => {
        res.write(`data: [DONE]\n\n`);
        res.end();
      });

      response.data.on("error", (err: any) => {
        this.logger.error("Streaming error:", err);
        res.write(`data: ${JSON.stringify({ error: "Stream error occurred" })}\n\n`);
        res.end();
      });
    } catch (err: any) {
      this.logger.warn(`Gemini streaming failed: ${err.message}. Attempting Groq streaming fallback...`);
      if (this.groqApiKey) {
        try {
          const messages = [
            { role: "system", content: systemInstruction },
            { role: "user", content: dto.message },
          ];
          const groqRes = await axios.post(
            "https://api.groq.com/openai/v1/chat/completions",
            {
              model: "qwen/qwen3.8-27b",
              messages,
              temperature: 0.7,
              stream: true,
            },
            {
              headers: {
                Authorization: `Bearer ${this.groqApiKey}`,
                "Content-Type": "application/json",
              },
              responseType: "stream",
              timeout: 45000,
            },
          );

          let buffer = "";
          groqRes.data.on("data", (chunk: Buffer) => {
            buffer += chunk.toString("utf8");
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith("data:")) {
                const jsonStr = trimmed.replace("data:", "").trim();
                if (!jsonStr || jsonStr === "[DONE]") {
                  if (jsonStr === "[DONE]") {
                    res.write(`data: [DONE]\n\n`);
                  }
                  continue;
                }
                try {
                  const parsed = JSON.parse(jsonStr);
                  const text = parsed?.choices?.[0]?.delta?.content;
                  if (text) {
                    res.write(`data: ${JSON.stringify({ text })}\n\n`);
                  }
                } catch {
                  // Ignore JSON parse errors for incomplete chunks
                }
              }
            }
          });

          groqRes.data.on("end", () => {
            res.write(`data: [DONE]\n\n`);
            res.end();
          });

          groqRes.data.on("error", (e: any) => {
            this.logger.error("Groq stream error:", e);
            res.write(`data: ${JSON.stringify({ error: "Stream error occurred" })}\n\n`);
            res.end();
          });
          return;
        } catch (groqErr: any) {
          this.logger.error("Groq streaming fallback also failed:", groqErr.message);
        }
      }
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }

  /**
   * Automatic MCQ Quiz Generator
   */
  async generateQuiz(dto: GenerateQuizDto) {
    const num = dto.numQuestions || 5;
    const difficulty = dto.difficulty || "INTERMEDIATE";

    const prompt = `Generate ${num} multiple choice questions (MCQ) on the topic: "${dto.topic}".
Difficulty level: ${difficulty}.

Return ONLY a valid JSON object in this exact schema without any markdown formatting or extra text:
{
  "topic": "${dto.topic}",
  "difficulty": "${difficulty}",
  "questions": [
    {
      "question": "The question string",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": "The exact correct option string",
      "explanation": "Brief explanation of why this answer is correct",
      "marks": 1
    }
  ]
}`;

    const raw = await this.generateText(prompt, "You are an expert exam question creator.", true);
    try {
      return JSON.parse(raw);
    } catch {
      const cleaned = raw.replace(/```json/g, "").replace(/```/g, "").trim();
      return JSON.parse(cleaned);
    }
  }

  /**
   * Automated Course Outline Planner for Instructors
   */
  async generateCourseOutline(dto: GenerateCourseOutlineDto) {
    const prompt = `Create a comprehensive, industry-standard curriculum outline for a course titled: "${dto.title}".
Course Description: ${dto.description || "N/A"}.
Target Level: ${dto.level || "Beginner to Advanced"}.

Return ONLY a valid JSON object in this exact schema:
{
  "title": "${dto.title}",
  "summary": "Short 2-line course summary",
  "learningOutcomes": ["Outcome 1", "Outcome 2", "Outcome 3", "Outcome 4"],
  "modules": [
    {
      "moduleTitle": "Module 1: Title",
      "description": "Module description",
      "lessons": [
        {
          "title": "Lesson 1: Title",
          "type": "VIDEO",
          "durationMinutes": 15,
          "summary": "What is covered in this lesson"
        }
      ]
    }
  ]
}`;

    const raw = await this.generateText(prompt, "You are a senior instructional designer and curriculum specialist.", true);
    try {
      return JSON.parse(raw);
    } catch {
      const cleaned = raw.replace(/```json/g, "").replace(/```/g, "").trim();
      return JSON.parse(cleaned);
    }
  }

  /**
   * Automated Assignment Grading and Feedback
   */
  async evaluateAssignment(dto: EvaluateAssignmentDto) {
    const prompt = `Evaluate the following student assignment submission based on the provided instructions.

Assignment Title: ${dto.assignmentTitle}
Instructions / Criteria: ${dto.instructions}
Maximum Marks: ${dto.maxMarks}

Student's Submission:
"""
${dto.studentSubmission}
"""

Evaluate fairly and provide constructive feedback.
Return ONLY a valid JSON object in this exact schema:
{
  "marksObtained": <numeric score out of ${dto.maxMarks}>,
  "percentage": <numeric percentage>,
  "grade": "A" | "B" | "C" | "D" | "F",
  "summary": "Overall evaluation summary",
  "strengths": ["Strength 1", "Strength 2"],
  "areasForImprovement": ["Point 1", "Point 2"],
  "detailedFeedback": "Detailed constructive feedback for the student"
}`;

    const raw = await this.generateText(prompt, "You are an objective, encouraging academic evaluator.", true);
    try {
      return JSON.parse(raw);
    } catch {
      const cleaned = raw.replace(/```json/g, "").replace(/```/g, "").trim();
      return JSON.parse(cleaned);
    }
  }

  /**
   * AI Lesson Summarizer & Key Notes Generator
   */
  async summarizeLesson(dto: SummarizeLessonDto) {
    let contentToSummarize = dto.content || "";
    let title = dto.lessonTitle || "Lesson Summary";

    if (dto.lessonId) {
      const lesson = await this.prisma.lesson.findUnique({
        where: { id: dto.lessonId },
      });
      if (lesson) {
        title = lesson.title;
        contentToSummarize = lesson.content || contentToSummarize;
      }
    }

    const prompt = `Summarize the following lesson content into concise study notes.
Lesson Title: "${title}"
Content:
"""
${contentToSummarize || "Overview of key concepts"}
"""

Return ONLY a valid JSON object in this exact schema:
{
  "title": "${title}",
  "quickSummary": "Concise 2-3 sentence overview",
  "keyTakeaways": ["Point 1", "Point 2", "Point 3", "Point 4"],
  "importantConcepts": [
    { "term": "Concept Name", "definition": "Brief definition" }
  ],
  "actionItems": ["Actionable step 1 for learners", "Actionable step 2 for learners"]
}`;

    const raw = await this.generateText(prompt, "You are an expert academic note summarizer.", true);
    try {
      return JSON.parse(raw);
    } catch {
      const cleaned = raw.replace(/```json/g, "").replace(/```/g, "").trim();
      return JSON.parse(cleaned);
    }
  }

  /**
   * AI Flashcards Generator for fast revision
   */
  async generateFlashcards(dto: GenerateFlashcardsDto) {
    const num = dto.numCards || 5;

    const prompt = `Create ${num} high-yield revision flashcards on the topic: "${dto.topic}".
Return ONLY a valid JSON object in this exact schema:
{
  "topic": "${dto.topic}",
  "flashcards": [
    {
      "id": 1,
      "front": "Question or term on the front of the card",
      "back": "Clear concise answer or explanation on the back",
      "hint": "Optional brief memory hint"
    }
  ]
}`;

    const raw = await this.generateText(prompt, "You are an expert flashcard author for fast active recall learning.", true);
    try {
      return JSON.parse(raw);
    } catch {
      const cleaned = raw.replace(/```json/g, "").replace(/```/g, "").trim();
      return JSON.parse(cleaned);
    }
  }
}
