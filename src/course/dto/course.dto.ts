import { ToBoolean, ToNumber } from "../../common/transforms";
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
  @ToNumber() @IsNumber() price!: number;
  @ToBoolean() @IsBoolean() @IsOptional() isFree?: boolean;
  @ToNumber() @IsNumber() @IsNotEmpty() durationMinutes!: number;
  @IsOptional() @IsString() thumbnail?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() requirements?: string;
  @IsOptional() learningOutcomes?: string;
  @IsOptional() tags?: string;
}

export class UpdateCourseDto extends PartialType(CreateCourseDto) {}
