import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsOptional,
} from "class-validator";

export class CreateLiveClassDto {
  @IsString() @IsNotEmpty() courseId!: string;
  @IsString() @IsNotEmpty() title!: string;
  @IsString() @IsOptional() description?: string;
  @IsString() @IsNotEmpty() meetingUrl!: string;
  @IsDateString() startTime!: string;
  @IsDateString() endTime!: string;
}

export class UpdateLiveClassDto {
  @IsString() @IsOptional() title?: string;
  @IsString() @IsOptional() description?: string;
  @IsString() @IsOptional() meetingUrl?: string;
  @IsDateString() @IsOptional() startTime?: string;
  @IsDateString() @IsOptional() endTime?: string;
  @IsString() @IsOptional() status?: string;
  @IsString() @IsOptional() recordingUrl?: string;
}
