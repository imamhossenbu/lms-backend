import { Transform } from "class-transformer";
import { IsString, Matches, MaxLength } from "class-validator";

/** Public verify page: /certificate/verify/:code. */
export class VerifyCodeParamDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MaxLength(64, { message: "64 characters or less" })
  @Matches(/^[A-Za-z0-9-]+$/, { message: "Enter a valid certificate code" })
  code!: string;
}
