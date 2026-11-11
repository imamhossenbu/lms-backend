import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from "class-validator";

const trim = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value);
/** "" (not set) or an https:// link. */
const HTTPS = /^$|^https:\/\/[^\s"'<>]+$/i;
const HTTPS_MSG = "Use a full https:// link (or leave it empty)";

export class WebsiteHeroDto {
  @ApiProperty() @Transform(trim) @IsString() @MaxLength(80, { message: "Headline can be at most 80 characters" }) title!: string;
  @ApiProperty() @Transform(trim) @IsString() @MaxLength(240, { message: "Sub-headline can be at most 240 characters" }) subtitle!: string;
}

export class WebsiteMissionDto {
  @ApiProperty() @Transform(trim) @IsString() @MaxLength(600) why!: string;
  @ApiProperty() @Transform(trim) @IsString() @MaxLength(600) what!: string;
  @ApiProperty() @Transform(trim) @IsString() @MaxLength(600) how!: string;
  @ApiProperty() @Transform(trim) @IsString() @Matches(HTTPS, { message: HTTPS_MSG }) imageUrl!: string;
}

export class WebsiteAppDto {
  @ApiProperty() @Transform(trim) @IsString() @MaxLength(80) title!: string;
  @ApiProperty() @Transform(trim) @IsString() @MaxLength(300) text!: string;
  @ApiProperty() @Transform(trim) @IsString() @Matches(HTTPS, { message: HTTPS_MSG }) appStoreUrl!: string;
  @ApiProperty() @Transform(trim) @IsString() @Matches(HTTPS, { message: HTTPS_MSG }) playStoreUrl!: string;
  @ApiProperty() @Transform(trim) @IsString() @Matches(HTTPS, { message: HTTPS_MSG }) screenshotUrl!: string;
}

export class WebsiteFaqDto {
  @ApiProperty() @Transform(trim) @IsString() @MaxLength(200, { message: "A question can be at most 200 characters" }) question!: string;
  @ApiProperty() @Transform(trim) @IsString() @MaxLength(1200, { message: "An answer can be at most 1,200 characters" }) answer!: string;
}

export class WebsiteSocialsDto {
  @ApiProperty() @Transform(trim) @IsString() @Matches(HTTPS, { message: HTTPS_MSG }) facebook!: string;
  @ApiProperty() @Transform(trim) @IsString() @Matches(HTTPS, { message: HTTPS_MSG }) instagram!: string;
  @ApiProperty() @Transform(trim) @IsString() @Matches(HTTPS, { message: HTTPS_MSG }) youtube!: string;
  @ApiProperty() @Transform(trim) @IsString() @Matches(HTTPS, { message: HTTPS_MSG }) linkedin!: string;
  @ApiProperty() @Transform(trim) @IsString() @Matches(HTTPS, { message: HTTPS_MSG }) tiktok!: string;
}

export class WebsiteNewsletterDto {
  @ApiProperty() @IsBoolean() enabled!: boolean;
  @ApiProperty() @Transform(trim) @IsString() @MaxLength(80) title!: string;
  @ApiProperty() @Transform(trim) @IsString() @MaxLength(240) text!: string;
}

/** Admin panel › Website › Content (saved whole). */
export class UpdateWebsiteDto {
  @ApiProperty({ type: WebsiteHeroDto }) @ValidateNested() @Type(() => WebsiteHeroDto) hero!: WebsiteHeroDto;
  @ApiProperty({ type: WebsiteMissionDto }) @ValidateNested() @Type(() => WebsiteMissionDto) mission!: WebsiteMissionDto;
  @ApiProperty({ type: WebsiteAppDto }) @ValidateNested() @Type(() => WebsiteAppDto) app!: WebsiteAppDto;
  @ApiProperty({ type: [WebsiteFaqDto] })
  @IsArray()
  @ArrayMaxSize(20, { message: "You can add up to 20 questions" })
  @ValidateNested({ each: true })
  @Type(() => WebsiteFaqDto)
  faqs!: WebsiteFaqDto[];
  @ApiProperty({ type: WebsiteSocialsDto }) @ValidateNested() @Type(() => WebsiteSocialsDto) socials!: WebsiteSocialsDto;
  @ApiProperty({ type: WebsiteNewsletterDto }) @ValidateNested() @Type(() => WebsiteNewsletterDto) newsletter!: WebsiteNewsletterDto;
  @ApiProperty() @Transform(trim) @IsString() @MaxLength(120, { message: "Office hours can be at most 120 characters" }) officeHours!: string;
}

export const MESSAGE_STATUSES = ["NEW", "READ", "REPLIED", "ARCHIVED"] as const;

export class MessageQueryDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(100) q?: string;
  @ApiPropertyOptional({ enum: MESSAGE_STATUSES }) @IsOptional() @IsIn(MESSAGE_STATUSES) status?: (typeof MESSAGE_STATUSES)[number];
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional({ default: 10 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

export class MessageStatusDto {
  @ApiProperty({ enum: MESSAGE_STATUSES }) @IsIn(MESSAGE_STATUSES, { message: "Unknown status" }) status!: (typeof MESSAGE_STATUSES)[number];
}

export const SUBSCRIBER_STATUSES = ["SUBSCRIBED", "UNSUBSCRIBED"] as const;

export class SubscriberQueryDto {
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(100) q?: string;
  @ApiPropertyOptional({ enum: SUBSCRIBER_STATUSES }) @IsOptional() @IsIn(SUBSCRIBER_STATUSES) status?: (typeof SUBSCRIBER_STATUSES)[number];
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @ApiPropertyOptional({ default: 10 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

export class SubscriberStatusDto {
  @ApiProperty({ enum: SUBSCRIBER_STATUSES }) @IsIn(SUBSCRIBER_STATUSES, { message: "Status must be SUBSCRIBED or UNSUBSCRIBED" }) status!: (typeof SUBSCRIBER_STATUSES)[number];
}
