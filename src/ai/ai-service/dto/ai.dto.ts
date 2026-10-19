import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsArray,
  Min,
  Max,
} from "class-validator";

export class AskTutorDto {
  @IsString()
  @IsNotEmpty()
  message!: string;

  @IsString()
  @IsOptional()
  courseId?: string;

  @IsString()
  @IsOptional()
  lessonId?: string;

  @IsArray()
  @IsOptional()
  chatHistory?: { role: "user" | "model"; text: string }[];
}

export class GenerateQuizDto {
  @IsString()
  @IsNotEmpty()
  topic!: string;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(20)
  numQuestions?: number = 5;

  @IsString()
  @IsOptional()
  difficulty?: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" = "INTERMEDIATE";
}

export class GenerateCourseOutlineDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  level?: string;
}

export class EvaluateAssignmentDto {
  @IsString()
  @IsNotEmpty()
  assignmentTitle!: string;

  @IsString()
  @IsNotEmpty()
  instructions!: string;

  @IsNumber()
  @Min(1)
  maxMarks!: number;

  @IsString()
  @IsNotEmpty()
  studentSubmission!: string;
}

export class SummarizeLessonDto {
  @IsString()
  @IsOptional()
  lessonId?: string;

  @IsString()
  @IsOptional()
  lessonTitle?: string;

  @IsString()
  @IsOptional()
  content?: string;
}

export class GenerateFlashcardsDto {
  @IsString()
  @IsNotEmpty()
  topic!: string;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(20)
  numCards?: number = 5;
}
