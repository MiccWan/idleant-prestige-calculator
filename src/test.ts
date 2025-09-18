import { Decimal } from "decimal.js";
import { Utils } from "./model/utils";

const a = new Decimal("6.037592e2");
const b = new Decimal("7.2513990048309049160e19");
const c = new Decimal("1.2403829944264168106e+26");
Decimal.set({ precision: 100 });
{
    const d = new Decimal("-1e33");
    
    const answers = Utils.solveCubic(a, b, c, d);
    // console.log(answers.map(a => a.toString()));
    const x = Decimal.min(...answers.filter(a => a.gt(0)));
    const x2 = x.pow(2);
    const x3 = x.pow(3);
    console.log('x', x.toString());
    console.log('f(x)', a.times(x3).plus(b.times(x2)).plus(c.times(x)).toString());
}

{
    const d = new Decimal("-1e+33");
    
    const answers = Utils.solveCubic(a, b, c, d);
    // console.log(answers.map(a => a.toString()));
    const x = Decimal.min(...answers.filter(a => a.gt(0)));
    const x2 = x.pow(2);
    const x3 = x.pow(3);
    console.log('x', x.toString());
    console.log('f(x)', a.times(x3).plus(b.times(x2)).plus(c.times(x)).toString());
}