import { IsString, IsOptional, IsUUID } from "class-validator";

export class CreateOrderDto {
  @IsUUID()
  courseId!: string;

  @IsOptional()
  @IsString()
  couponId?: string;
}
