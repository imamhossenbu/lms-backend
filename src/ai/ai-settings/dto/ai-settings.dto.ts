import {
  IsString,
  IsInt,
  IsNumber,
  IsBoolean,
  IsOptional,
  IsNotEmpty,
  IsObject,
} from "class-validator";

export class FeatureConfigDto {
  @IsString() provider!: string;
  @IsString() modelName!: string;
  @IsString() baseUrl!: string;
  @IsInt() maxTokens!: number;
  @IsNumber() temperature!: number;
  @IsString() systemPrompt!: string;
  @IsBoolean() isActive!: boolean;
}

// নতুন ফিচার যোগ করার DTO
export class CreateAiSettingsDto {
  @IsNotEmpty() @IsString() featureKey!: string;
  @IsNotEmpty() @IsObject() config!: FeatureConfigDto;
}

export class UpdateAiSettingsDto {
  @IsOptional() @IsObject() config?: FeatureConfigDto;
}
