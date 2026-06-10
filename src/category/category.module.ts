import { Module } from '@nestjs/common';
import { CategoryController } from './category.controller';
import { CategoryService } from './category.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CloudinaryService } from '../cloudinary/cloudinary.service'; 

@Module({
  imports: [PrismaModule], 
  controllers: [CategoryController],
  providers: [CategoryService, CloudinaryService], 
  exports: [CategoryService], 
})
export class CategoryModule {}