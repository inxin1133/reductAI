import express from "express"
import { requireAuth } from "../middleware/requireAuth"
import {
  createMyPageCategory,
  createPost,
  deleteCategory,
  getPostContent,
  getPostPreview,
  getCurrentTenant,
  listMyPageCategories,
  listMyPages,
  reorderCategories,
  savePostContent,
  updateCategory,
  updatePost,
  updatePostCategory,
} from "../controllers/postsController"

const router = express.Router()

// Categories (personal pages)
router.get("/categories/mine", requireAuth, listMyPageCategories)
router.post("/categories", requireAuth, createMyPageCategory)
router.patch("/categories/:id", requireAuth, updateCategory)
router.delete("/categories/:id", requireAuth, deleteCategory)
router.post("/categories/reorder", requireAuth, reorderCategories)

// Tenant (current)
router.get("/tenant/current", requireAuth, getCurrentTenant)

router.post("/", requireAuth, createPost)
router.get("/mine", requireAuth, listMyPages)
router.get("/:id/preview", requireAuth, getPostPreview)
router.patch("/:id", requireAuth, updatePost)
router.patch("/:id/category", requireAuth, updatePostCategory)
router.get("/:id/content", requireAuth, getPostContent)
router.post("/:id/content", requireAuth, savePostContent)

export default router


