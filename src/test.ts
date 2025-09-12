import { Decimal } from "decimal.js";
import { Utils } from "./model/utils";

const a = new Decimal("2e6");
const b = new Decimal("4e20");
const c = new Decimal("1e26");
const d = new Decimal("-7e30");

const answers = Utils.solveCubic(a, b, c, d);
console.log(answers.map(a => a.toString()));