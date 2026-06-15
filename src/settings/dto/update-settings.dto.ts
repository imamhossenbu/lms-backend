import {
  IsString,
  IsBoolean,
  IsOptional,
  IsHexColor,
  IsEmail,
  IsUrl,
} from "class-validator";

export class UpdateSettingDto {
  @IsOptional() @IsString() siteName?: string;
  @IsOptional() @IsString() logo?: string;
  @IsOptional() @IsString() favicon?: string;

  @IsOptional() @IsBoolean() allowRegistration?: boolean;
  @IsOptional() @IsBoolean() certificateEnabled?: boolean;
  @IsOptional() @IsBoolean() aiEnabled?: boolean;
  @IsOptional() @IsBoolean() maintenanceMode?: boolean;

  @IsOptional() @IsHexColor() primaryColor?: string;
  @IsOptional() @IsHexColor() secondaryColor?: string;
  @IsOptional() @IsHexColor() accentColor?: string;
  @IsOptional() @IsHexColor() backgroundColor?: string;
  @IsOptional() @IsHexColor() surfaceColor?: string;
  @IsOptional() @IsHexColor() textColor?: string;
  @IsOptional() @IsHexColor() textMutedColor?: string;

  @IsOptional() @IsEmail() supportEmail?: string;
  @IsOptional() @IsString() contactPhone?: string;
  @IsOptional() @IsUrl() facebookUrl?: string;
  @IsOptional() @IsUrl() youtubeUrl?: string;
}
