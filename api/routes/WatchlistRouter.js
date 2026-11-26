import { Router } from "express";
import requireAuth from "../middleware/requireAuth.js";
import * as C from "../controllers/WatchlistController.js";

const router = Router();
router.use(requireAuth);

router.get("/", C.list);
router.post("/", C.create);
router.get("/:id", C.get);
router.delete("/:id", C.remove);
router.post("/:id/movies", C.addMovie);
router.delete("/:id/movies/:movieId", C.removeMovie);

export default router;