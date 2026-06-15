import {
  IsString,
  IsInt,
  IsDecimal,
  IsBoolean,
  IsOptional,
  IsUrl,
  IsNotEmpty,
} from "class-validator";

export class UpdateAiSettingsDto {
  @IsOptional() @IsString() provider?: string;
  @IsOptional() @IsString() modelName?: string;
  @IsOptional() @IsUrl() baseUrl?: string;
  @IsOptional() @IsInt() maxTokens?: number;
  @IsOptional() @IsDecimal() temperature?: number;
  @IsOptional() @IsString() systemPrompt?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateAiSettingsDto {
  @IsNotEmpty() @IsString() provider!: string;
  @IsNotEmpty() @IsString() modelName!: string;
  @IsNotEmpty() @IsUrl() baseUrl!: string;

  @IsNotEmpty() @IsInt() maxTokens!: number;

  @IsNotEmpty() @IsDecimal() temperature!: number;

  @IsNotEmpty() @IsString() systemPrompt!: string;

  @IsOptional() @IsBoolean() isActive?: boolean;
}
