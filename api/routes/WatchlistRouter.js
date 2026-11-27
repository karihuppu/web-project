import { Router } from "express";
import requireAuth from "../middleware/requireAuth.js";
import * as C from "../controllers/WatchlistController.js";
import * as S from '../controllers/WatchlistShareController.js'

const router = Router();
router.use(requireAuth);

router.get("/", C.list);
router.post("/", C.create);
router.get("/:id", C.get);
router.delete("/:id", C.remove);
router.post("/:id/movies", C.addMovie);
router.delete("/:id/movies/:movieId", C.removeMovie);
router.get('/:id/shares', S.listShares)
router.post('/:id/shares', S.share)
router.delete('/:id/shares/:groupId', S.unshare)

export default router;