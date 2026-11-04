import { Test, TestingModule } from "@nestjs/testing";
import { CloudinaryService } from "../cloudinary/cloudinary.service";
import { UserController } from "./user.controller";
import { UserService } from "./user.service";
import { TeamAccessService } from "../team/services/team-access.service";

describe("UserController", () => {
  let controller: UserController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [
        { provide: UserService, useValue: {} },
        { provide: CloudinaryService, useValue: {} },
        { provide: TeamAccessService, useValue: {} },
      ],
    }).compile();

    controller = module.get<UserController>(UserController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });
});
