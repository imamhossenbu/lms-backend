import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "../../../../generated/prisma";
import { paginated, type Paginated } from "../../../common/pagination";
import { SaasCoreService } from "../../services/saas-core.service";
import { toCouponView } from "../coupon.mapper";
import { couponDataFromForm, couponFormErrors, couponStats } from "../coupon.rules";
import type { CouponStats, CouponView } from "../coupons.types";
import type { CouponFormDto, ListCouponsQueryDto } from "../dto/coupon.dto";

const WITH_REDEMPTIONS = { redemptions: true } as const;

/** Owner Console › Coupons: list / stats / detail / create / edit / enable-disable / delete. */
@Injectable()
export class CouponsService {
  constructor(private readonly core: SaasCoreService) {}

  private get prisma() {
    return this.core.prisma;
  }

  /**
   * Status is derived (expiry / redemption count), so filtering + paging happen after mapping.
   * Coupon counts are small (owner-created campaign codes).
   */
  async list(q: ListCouponsQueryDto): Promise<Paginated<CouponView>> {
    const term = q.q?.trim();
    const rows = await this.prisma.saasCoupon.findMany({
      where: {
        ...(q.type ? { type: q.type } : {}),
        ...(term ? { OR: [{ code: { contains: term, mode: "insensitive" } }, { description: { contains: term, mode: "insensitive" } }] } : {}),
      },
      include: WITH_REDEMPTIONS,
      orderBy: { createdAt: "desc" },
    });
    const now = Date.now();
    const views = rows.map((r) => toCouponView(r, now)).filter((c) => !q.status || c.status === q.status);
    const start = (q.page - 1) * q.limit;
    return paginated(views.slice(start, start + q.limit), views.length, q);
  }

  async stats(): Promise<CouponStats> {
    const rows = await this.prisma.saasCoupon.findMany({ include: WITH_REDEMPTIONS });
    const now = Date.now();
    return couponStats(rows.map((r) => toCouponView(r, now)), now);
  }

  async get(id: string): Promise<CouponView> {
    const row = await this.prisma.saasCoupon.findUnique({ where: { id }, include: WITH_REDEMPTIONS });
    if (!row) throw new NotFoundException("This coupon no longer exists.");
    return toCouponView(row);
  }

  async create(dto: CouponFormDto, ownerId: string): Promise<CouponView> {
    await this.validate(dto);
    try {
      const row = await this.prisma.saasCoupon.create({ data: { ...couponDataFromForm(dto), createdById: ownerId }, include: WITH_REDEMPTIONS });
      return toCouponView(row);
    } catch (err) {
      throw this.codeConflict(err, dto.code);
    }
  }

  async update(id: string, dto: CouponFormDto): Promise<CouponView> {
    const current = await this.prisma.saasCoupon.findUnique({ where: { id }, include: { _count: { select: { redemptions: true } } } });
    if (!current) throw new NotFoundException("This coupon no longer exists.");
    if (current._count.redemptions && dto.code !== current.code)
      throw new BadRequestException("A redeemed coupon's code can't be changed — create a new coupon instead.");
    await this.validate(dto);
    try {
      const row = await this.prisma.saasCoupon.update({ where: { id }, data: couponDataFromForm(dto), include: WITH_REDEMPTIONS });
      return toCouponView(row);
    } catch (err) {
      throw this.codeConflict(err, dto.code);
    }
  }

  /** Disabled coupons can't be redeemed; discounts already running keep going. */
  async setActive(id: string, active: boolean): Promise<CouponView> {
    const res = await this.prisma.saasCoupon.updateMany({ where: { id }, data: { active } });
    if (!res.count) throw new NotFoundException("This coupon no longer exists.");
    return this.get(id);
  }

  async remove(id: string): Promise<{ id: string }> {
    const current = await this.prisma.saasCoupon.findUnique({ where: { id }, include: { _count: { select: { redemptions: true } } } });
    if (!current) throw new NotFoundException("This coupon no longer exists.");
    if (current._count.redemptions) throw new BadRequestException("This coupon has been redeemed — disable it instead so its history is kept.");
    try {
      await this.prisma.saasCoupon.delete({ where: { id } });
    } catch (err) {
      // Redeemed between the check and the delete (FK restrict).
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003")
        throw new BadRequestException("This coupon has been redeemed — disable it instead so its history is kept.");
      throw err;
    }
    return { id };
  }

  // ---------------------------------------------------------------- helpers

  private async validate(dto: CouponFormDto) {
    const errors = couponFormErrors(dto);
    if (dto.planIds.length) {
      const found = await this.prisma.saasPlan.findMany({ where: { id: { in: dto.planIds } }, select: { id: true } });
      const missing = dto.planIds.filter((id) => !found.some((p) => p.id === id));
      if (missing.length) errors.push(`Unknown plan${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`);
    }
    if (errors.length) throw new BadRequestException(errors);
  }

  private codeConflict(err: unknown, code: string) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")
      return new ConflictException(`The code ${code} is already used by another coupon.`);
    return err;
  }
}
