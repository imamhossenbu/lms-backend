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
  @IsNumber() @IsNotEmpty() order!: number;
  @IsBoolean() @IsOptional() isLocked?: boolean;
}

export class UpdateModuleDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsNumber() order?: number;
  @IsOptional() @IsBoolean() isLocked?: boolean;
}
