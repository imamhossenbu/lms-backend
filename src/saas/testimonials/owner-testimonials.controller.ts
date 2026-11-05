import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { RequireRoles, SaasValidation } from "../controllers/saas-controller.utils";
import { PLATFORM_OWNER_ROLE } from "../saas.constants";
import { ListTestimonialsQueryDto, TestimonialFormDto, UpdateTestimonialDto } from "./testimonial.dto";
import { TestimonialsService } from "./testimonials.service";

const Id = () => Param("id", new ParseUUIDPipe({ errorHttpStatusCode: 404 }));

/** Owner Console › Testimonials shown on the marketing website. */
@ApiTags("SaaS · Owner")
@Controller("saas/owner/testimonials")
@RequireRoles(PLATFORM_OWNER_ROLE)
@SaasValidation()
export class OwnerTestimonialsController {
  constructor(private readonly testimonials: TestimonialsService) {}

  @Get()
  @ApiOperation({ summary: "All testimonials — ?q, ?status=published|draft, ?page, ?limit → { data, meta }" })
  list(@Query() q: ListTestimonialsQueryDto) {
    return this.testimonials.list(q);
  }

  @Post()
  create(@Body() dto: TestimonialFormDto) {
    return this.testimonials.create(dto);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Edit, publish / unpublish, feature or reorder" })
  update(@Id() id: string, @Body() dto: UpdateTestimonialDto) {
    return this.testimonials.update(id, dto);
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(@Id() id: string) {
    await this.testimonials.remove(id);
  }
}
