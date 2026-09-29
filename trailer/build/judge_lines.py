import sys; sys.path.insert(0,'.')
from judge_audio import ask
q = ("You are a film trailer casting director with expert ears. Two takes each of two lines by the same character follow "
     "(Alpha, a young female mouse navigator). Line 1 direction: breathless whispered horror as she realises a trap: 'She baited the trail.' "
     "Line 2 direction: a raw, desperate scream of command in terror: 'Reroute! Scatter!'. For each clip: verbatim transcript, 1-10 for "
     "naturalness, emotional match, clarity, artifacts (10 = none), one-sentence notes. Then choose the best take of each line.")
print(ask([('1A','vo/alpha_baited_a.wav'),('1B','vo/alpha_baited_b.wav'),('2A','vo/alpha_scatter_a.wav'),('2B','vo/alpha_scatter_b.wav')], q))
