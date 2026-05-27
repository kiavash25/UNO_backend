import { Router } from "express";
import type { AdminService } from "../../../application/adminService.js";
import { asyncHandler } from "../asyncHandler.js";
import { AdminAuthController } from "../controllers/adminAuthController.js";

export function createAdminAuthRouter(adminService: AdminService): Router {
  const router = Router();
  const controller = new AdminAuthController(adminService);

  router.post("/login", asyncHandler(controller.login));

  return router;
}
