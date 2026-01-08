"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const requireAuth_1 = require("../middleware/requireAuth");
const postsController_1 = require("../controllers/postsController");
const router = express_1.default.Router();
router.post("/", requireAuth_1.requireAuth, postsController_1.createPost);
router.get("/mine", requireAuth_1.requireAuth, postsController_1.listMyPages);
router.get("/:id/preview", requireAuth_1.requireAuth, postsController_1.getPostPreview);
router.get("/:id/content", requireAuth_1.requireAuth, postsController_1.getPostContent);
router.post("/:id/content", requireAuth_1.requireAuth, postsController_1.savePostContent);
exports.default = router;
