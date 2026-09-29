import sys, concurrent.futures as cf; sys.path.insert(0, '.')
import gen_plates as gp, orclient as oc
from PIL import Image
names = sys.argv[1:]
def run(name):
    j = gp.JOBS[name]
    extra = {'size': j['size']} if j.get('size') else None
    try:
        out, u = oc.image("openai/gpt-image-2.5-sunburst", j['prompt'], f"gen/{name}.png", aspect_ratio=None if extra else j.get('ar', '16:9'),
                          quality=j['q'], refs=j['refs'], extra=extra, estimate=j.get('est', 0.3), purpose=name)
        return name, Image.open(out).size, u.get('cost')
    except SystemExit as e:
        return name, 'FAILED', str(e)
with cf.ThreadPoolExecutor(4) as ex:
    for r in ex.map(run, names):
        print(r, flush=True)
print('total spent', round(oc.spent(), 4))
