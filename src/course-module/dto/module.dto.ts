import { ToBoolean, ToNumber } from "../../common/transforms";
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsBoolean,
  IsOptional,
} from "class-validator";

export class CreateModuleDto {
  @IsString() @IsNotEmpty() title!: string;
  @IsString() @IsOptional() description?: string;
  @ToNumber() @IsNumber() @IsNotEmpty() order!: number;
  @ToBoolean() @IsBoolean() @IsOptional() isLocked?: boolean;
}

export class UpdateModuleDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @ToNumber() @IsNumber() order?: number;
  @IsOptional() @ToBoolean() @IsBoolean() isLocked?: boolean;
}
