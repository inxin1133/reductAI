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
router.get("/tenant/current", requireAuth_1.requireAuth, postsController_1.getCurrentTenant);
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
