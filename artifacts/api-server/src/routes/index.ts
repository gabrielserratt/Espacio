import { Router, type IRouter } from "express";
import healthRouter from "./health";
import espacioVergaraRouter from "./espacio-vergara";
import storageRouter from "./storage";

const router: IRouter = Router();

router.use(healthRouter);
router.use(espacioVergaraRouter);
router.use(storageRouter);

export default router;
