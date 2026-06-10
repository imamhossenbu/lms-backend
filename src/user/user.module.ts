import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CloudinaryService } from '../cloudinary/cloudinary.service'; 

@Module({
  imports: [PrismaModule],
  controllers: [UserController],
  providers: [UserService, CloudinaryService], 
  exports: [UserService, CloudinaryService],  
})
export class UserModule {}