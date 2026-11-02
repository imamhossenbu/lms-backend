import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

/** `?page=1&limit=10` — shared by every paginated list endpoint. */
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "page must be a whole number" })
  @Min(1, { message: "page must be at least 1" })
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: "limit must be a whole number" })
  @Min(1, { message: "limit must be at least 1" })
  @Max(100, { message: "limit can be at most 100" })
  limit: number = 10;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** Standard list envelope: `{ data, meta }`. */
export interface Paginated<T> {
  data: T[];
  meta: PaginationMeta;
}

export const skipTake = ({ page, limit }: PaginationQueryDto) => ({ skip: (page - 1) * limit, take: limit });

export function paginated<T>(data: T[], total: number, { page, limit }: PaginationQueryDto): Paginated<T> {
  return { data, meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
}
