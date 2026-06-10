import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsBoolean,
  IsOptional,
} from "class-validator";
import { PartialType } from "@nestjs/mapped-types";

export class CreateCourseDto {
  @IsString() @IsNotEmpty() title!: string;
  @IsString() @IsNotEmpty() slug!: string;
  @IsString() @IsNotEmpty() description!: string;
  @IsString() @IsNotEmpty() shortDescription!: string;
  @IsString() @IsNotEmpty() categoryId!: string;
  @IsString() @IsNotEmpty() level!: string;
  @IsString() @IsNotEmpty() language!: string;
  @IsNumber() price!: number;
  @IsBoolean() @IsOptional() isFree?: boolean;
  @IsNumber() @IsNotEmpty() durationMinutes!: number;
  @IsOptional() requirements?: string;
  @IsOptional() learningOutcomes?: string;
  @IsOptional() tags?: string;
}

export class UpdateCourseDto extends PartialType(CreateCourseDto) {}
