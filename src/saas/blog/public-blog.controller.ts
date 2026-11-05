import { Controller, Get, Param, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { SaasValidation } from "../controllers/saas-controller.utils";
import { PublicBlogQueryDto } from "./blog.dto";
import { BlogService } from "./blog.service";

/** Published blog posts for the marketing website (no sign-in). */
@ApiTags("SaaS · Public")
@Controller("saas/public/blog")
@SaasValidation()
@Throttle({ default: { limit: 120, ttl: 60_000 } })
export class PublicBlogController {
  constructor(private readonly blog: BlogService) {}

  @Get()
  @ApiOperation({ summary: "Published posts, newest first — ?q, ?category, ?page, ?limit → { data, meta, featured, categories }" })
  list(@Query() q: PublicBlogQueryDto) {
    return this.blog.published(q);
  }

  @Get(":slug")
  @ApiOperation({ summary: "One published post with its Markdown body and related posts" })
  bySlug(@Param("slug") slug: string) {
    return this.blog.bySlug(slug.toLowerCase().slice(0, 100));
  }
}
