import {
  IsString,
  IsInt,
  IsDecimal,
  IsBoolean,
  IsOptional,
  IsUrl,
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
