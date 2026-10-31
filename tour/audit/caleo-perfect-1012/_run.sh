#!/bin/bash
# rebuild the Caleo model from the iteration-11 JSON, plot the plan, list facets. usage: bash _run.sh
cd /c/Users/wjack/roof-command-jackson
cp tour/audit/caleo-perfect-1012/164153-iteration-11.json tour/lib/st-data-dfw/meta/roof-detail/collin-tx/164153.json
timeout 300 python -u -E -P scripts/dfw/roof_house.py tour/lib/st-data-dfw/meta/roof-detail/collin-tx/164153.json > tour/audit/caleo-perfect-1012/_run.log 2>&1
grep -v -E "^\s*[-0-9.]*,?$" tour/audit/caleo-perfect-1012/_run.log | grep -A40 -E "solids|Traceback" | head -70
cp tour/lib/st-data-dfw/meta/roof-detail/collin-tx/164153.json tour/audit/caleo-perfect-1012/164153-dev.json
python -E tour/audit/caleo-perfect-1012/_plan.py tour/audit/caleo-perfect-1012/164153-dev.json tour/audit/caleo-perfect-1012/_dev-plan.png
python -E tour/audit/caleo-perfect-1012/_list.py tour/audit/caleo-perfect-1012/164153-dev.json
