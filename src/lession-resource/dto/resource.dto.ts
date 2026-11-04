import { ToBoolean } from "../../common/transforms";
import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength } from "class-validator";

/**
 * A lesson resource. Send a multipart `file` (uploaded to Cloudinary; fileUrl / fileType / size are then taken
 * from the upload) or JSON with an already-hosted `fileUrl` (e.g. from POST /courses/upload-media) or a link.
 */
export class CreateLessonResourceDto {
  @IsString() @IsNotEmpty() @MaxLength(120) title!: string;
  /** Required when no file is uploaded. */
  @IsOptional() @IsUrl({ protocols: ["http", "https"], require_protocol: true }, { message: "fileUrl must be a valid http(s) URL" }) @MaxLength(2000) fileUrl?: string;
  /** e.g. "PDF", "ZIP", "LINK" or a MIME type. */
  @IsOptional() @IsString() @MaxLength(100) fileType?: string;
  /** e.g. "2.45 MB". */
  @IsOptional() @IsString() @MaxLength(40) size?: string;
  @ToBoolean() @IsBoolean() @IsOptional() isDownloadable?: boolean;
}

export class UpdateLessonResourceDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(120) title?: string;
  @IsOptional() @IsUrl({ protocols: ["http", "https"], require_protocol: true }, { message: "fileUrl must be a valid http(s) URL" }) @MaxLength(2000) fileUrl?: string;
  @IsOptional() @IsString() @MaxLength(100) fileType?: string;
  @IsOptional() @IsString() @MaxLength(40) size?: string;
  @ToBoolean() @IsBoolean() @IsOptional() isDownloadable?: boolean;
}
