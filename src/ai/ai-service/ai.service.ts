import { Injectable, Logger, InternalServerErrorException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma/prisma.service";
import axios from "axios";
import {
  AskTutorDto,
  GenerateQuizDto,
  GenerateCourseOutlineDto,
  EvaluateAssignmentDto,
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
            maxOutputTokens: 2048,
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
      try {
        const messages: any[] = [];
        if (systemInstruction) {
          messages.push({ role: "system", content: systemInstruction });
        }
        messages.push({ role: "user", content: prompt });

        const response = await axios.post(
          "https://api.groq.com/openai/v1/chat/completions",
          {
            model: "llama-3.3-70b-versatile",
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
        this.logger.error(`Groq API failed: ${err.message}`);
      }
    }

    throw new InternalServerErrorException(
      "AI Service is currently unavailable. Please verify API keys.",
    );
  }

  /**
   * AI Tutor / Doubt Solver for students
   */
  async askTutor(dto: AskTutorDto) {
    let context = "";

    if (dto.courseId) {
      const course = await this.prisma.course.findUnique({
        where: { id: dto.courseId },
        select: { title: true, description: true },
      });
      if (course) {
        context += `Course: "${course.title}". Course Overview: ${course.description}\n`;
      }
    }

    if (dto.lessonId) {
      const lesson = await this.prisma.lesson.findUnique({
        where: { id: dto.lessonId },
        select: { title: true, content: true },
      });
      if (lesson) {
        context += `Lesson: "${lesson.title}". Lesson Content: ${lesson.content || "N/A"}\n`;
      }
    }

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
      // Clean possible markdown code fences if present
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
}
