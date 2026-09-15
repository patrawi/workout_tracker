# Separate distribution fitting from uncertainty propagation

The user identified that learning an input distribution from observations and propagating an already-specified distribution with Monte Carlo are different operations. This distinction rules out expecting repeated simulation to discover hidden recipe variation and supports deferring Monte Carlo until calibrated inputs exist.
