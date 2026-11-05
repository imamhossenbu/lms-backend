import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { RequireRoles, SaasValidation } from "../controllers/saas-controller.utils";
import { PLATFORM_OWNER_ROLE } from "../saas.constants";
import { BlogPostFormDto, ListBlogPostsQueryDto, UpdateBlogPostDto } from "./blog.dto";
import { BlogService } from "./blog.service";

const Id = () => Param("id", new ParseUUIDPipe({ errorHttpStatusCode: 404 }));

/** Owner Console › Blog: posts shown on the marketing website. */
@ApiTags("SaaS · Owner")
@Controller("saas/owner/blog")
@RequireRoles(PLATFORM_OWNER_ROLE)
@SaasValidation()
export class OwnerBlogController {
  constructor(private readonly blog: BlogService) {}

  @Get()
  @ApiOperation({ summary: "All posts — ?q, ?status=published|draft, ?category, ?page, ?limit → { data, meta }" })
  list(@Query() q: ListBlogPostsQueryDto) {
    return this.blog.list(q);
  }

  @Get(":id")
  get(@Id() id: string) {
    return this.blog.get(id);
  }

  @Post()
  @ApiOperation({ summary: "Create a post (slug generated from the title when left out)" })
  create(@Body() dto: BlogPostFormDto) {
    return this.blog.create(dto);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Edit, publish / unpublish or feature" })
  update(@Id() id: string, @Body() dto: UpdateBlogPostDto) {
    return this.blog.update(id, dto);
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(@Id() id: string) {
    await this.blog.remove(id);
  }
}
