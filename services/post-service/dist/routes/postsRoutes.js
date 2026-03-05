"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const requireAuth_1 = require("../middleware/requireAuth");
const postsController_1 = require("../controllers/postsController");
const router = express_1.default.Router();
// Categories (personal pages)
router.get("/categories/mine", requireAuth_1.requireAuth, postsController_1.listMyPageCategories);
router.post("/categories", requireAuth_1.requireAuth, postsController_1.createMyPageCategory);
router.patch("/categories/:id", requireAuth_1.requireAuth, postsController_1.updateCategory);
router.delete("/categories/:id", requireAuth_1.requireAuth, postsController_1.deleteCategory);
router.post("/categories/reorder", requireAuth_1.requireAuth, postsController_1.reorderCategories);
// Tenant (current)
router.get("/user/me", requireAuth_1.requireAuth, postsController_1.getCurrentUser);
router.patch("/user/me", requireAuth_1.requireAuth, postsController_1.updateCurrentUser);
router.get("/user/providers", requireAuth_1.requireAuth, postsController_1.listCurrentUserProviders);
router.get("/user/sessions", requireAuth_1.requireAuth, postsController_1.listCurrentUserSessions);
router.delete("/user/sessions", requireAuth_1.requireAuth, postsController_1.revokeOtherUserSessions);
router.delete("/user/sessions/:id", requireAuth_1.requireAuth, postsController_1.revokeCurrentUserSession);
router.get("/tenant/current", requireAuth_1.requireAuth, postsController_1.getCurrentTenant);
router.get("/tenant/owner-tier", requireAuth_1.requireAuth, postsController_1.getOwnerTenantTier);
router.get("/tenant/memberships", requireAuth_1.requireAuth, postsController_1.listTenantMemberships);
router.get("/tenant/members", requireAuth_1.requireAuth, postsController_1.listTenantMembers);
router.get("/tenant/invitations", requireAuth_1.requireAuth, postsController_1.listTenantInvitations);
router.post("/tenant/invitations", requireAuth_1.requireAuth, postsController_1.createTenantInvitation);
router.put("/tenant/invitations/:id", requireAuth_1.requireAuth, postsController_1.updateTenantInvitation);
router.put("/tenant/members/:id", requireAuth_1.requireAuth, postsController_1.updateTenantMember);
router.patch("/tenant/:id", requireAuth_1.requireAuth, postsController_1.updateTenantName);
router.get("/user/invitations", requireAuth_1.requireAuth, postsController_1.listMyInvitations);
router.post("/user/invitations/:id/accept", requireAuth_1.requireAuth, postsController_1.acceptMyInvitation);
router.post("/user/invitations/:id/reject", requireAuth_1.requireAuth, postsController_1.rejectMyInvitation);
// Trash (deleted posts)
router.get("/trash", requireAuth_1.requireAuth, postsController_1.listDeletedPages);
router.get("/trash/:id", requireAuth_1.requireAuth, postsController_1.getDeletedPageDetail);
router.post("/trash/:id/restore", requireAuth_1.requireAuth, postsController_1.restoreDeletedPage);
router.delete("/trash/:id", requireAuth_1.requireAuth, postsController_1.purgeDeletedPage);
router.post("/", requireAuth_1.requireAuth, postsController_1.createPost);
router.get("/mine", requireAuth_1.requireAuth, postsController_1.listMyPages);
router.get("/:id/preview", requireAuth_1.requireAuth, postsController_1.getPostPreview);
router.patch("/:id", requireAuth_1.requireAuth, postsController_1.updatePost);
router.patch("/:id/category", requireAuth_1.requireAuth, postsController_1.updatePostCategory);
router.post("/:id/move", requireAuth_1.requireAuth, postsController_1.movePage);
router.get("/:id/content", requireAuth_1.requireAuth, postsController_1.getPostContent);
router.post("/:id/content", requireAuth_1.requireAuth, postsController_1.savePostContent);
exports.default = router;
