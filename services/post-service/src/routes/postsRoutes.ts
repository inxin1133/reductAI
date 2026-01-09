import express from "express"
import { requireAuth } from "../middleware/requireAuth"
import { createPost, getPostContent, getPostPreview, listMyPages, savePostContent, updatePost } from "../controllers/postsController"

const router = express.Router()

router.post("/", requireAuth, createPost)
router.get("/mine", requireAuth, listMyPages)
router.get("/:id/preview", requireAuth, getPostPreview)
router.patch("/:id", requireAuth, updatePost)
router.get("/:id/content", requireAuth, getPostContent)
router.post("/:id/content", requireAuth, savePostContent)

export default router


