import express from "express"
import { requireAuth } from "../middleware/requireAuth"
import {
  createMyPageCategory,
  createPost,
  deleteCategory,
  getDeletedPageDetail,
  getPostContent,
  getPostPreview,
  getCurrentTenant,
  getCurrentUser,
  listCurrentUserProviders,
  listCurrentUserSessions,
  listTenantMembers,
  listTenantMemberships,
  listDeletedPages,
  listMyPageCategories,
  listMyPages,
  movePage,
  purgeDeletedPage,
  reorderCategories,
  revokeCurrentUserSession,
  restoreDeletedPage,
  savePostContent,
  updateCategory,
  updatePost,
  updatePostCategory,
  updateCurrentUser,
  updateTenantMember,
  updateTenantName,
} from "../controllers/postsController"

const router = express.Router()

// Categories (personal pages)
router.get("/categories/mine", requireAuth, listMyPageCategories)
router.post("/categories", requireAuth, createMyPageCategory)
router.patch("/categories/:id", requireAuth, updateCategory)
router.delete("/categories/:id", requireAuth, deleteCategory)
router.post("/categories/reorder", requireAuth, reorderCategories)

// Tenant (current)
router.get("/user/me", requireAuth, getCurrentUser)
router.patch("/user/me", requireAuth, updateCurrentUser)
router.get("/user/providers", requireAuth, listCurrentUserProviders)
router.get("/user/sessions", requireAuth, listCurrentUserSessions)
router.delete("/user/sessions/:id", requireAuth, revokeCurrentUserSession)
router.get("/tenant/current", requireAuth, getCurrentTenant)
router.get("/tenant/memberships", requireAuth, listTenantMemberships)
router.get("/tenant/members", requireAuth, listTenantMembers)
router.put("/tenant/members/:id", requireAuth, updateTenantMember)
router.patch("/tenant/:id", requireAuth, updateTenantName)

// Trash (deleted posts)
router.get("/trash", requireAuth, listDeletedPages)
router.get("/trash/:id", requireAuth, getDeletedPageDetail)
router.post("/trash/:id/restore", requireAuth, restoreDeletedPage)
router.delete("/trash/:id", requireAuth, purgeDeletedPage)

router.post("/", requireAuth, createPost)
router.get("/mine", requireAuth, listMyPages)
router.get("/:id/preview", requireAuth, getPostPreview)
router.patch("/:id", requireAuth, updatePost)
router.patch("/:id/category", requireAuth, updatePostCategory)
router.post("/:id/move", requireAuth, movePage)
router.get("/:id/content", requireAuth, getPostContent)
router.post("/:id/content", requireAuth, savePostContent)

export default router


