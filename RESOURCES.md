# Nutrition Uncertainty Resources

## Knowledge

- [BIPM: JCGM 101:2008 — Propagation of distributions using a Monte Carlo method](https://www.bipm.org/en/doi/10.59161/jcgm101-2008)
  International metrology guidance on propagating input distributions through a mathematical measurement model. Use for: deciding when Monte Carlo uncertainty propagation is justified.
- [NIST: Measurement Uncertainty](https://www.nist.gov/itl/sed/topic-areas/measurement-uncertainty)
  Overview of analytical and Monte Carlo approaches to evaluating output uncertainty. Use for: distinguishing the measurement model from the uncertainty method.
- [NIST: Uncertainty Machine User's Manual](https://www.nist.gov/publications/uncertainty-machine-users-manual)
  Defines the core model as `Y = f(X1, ..., Xn)` with explicit input distributions. Use for: understanding what a simulation must specify before sampling is meaningful.

## Gaps

- No calibrated distribution yet exists for recipe variation at the target canteen.
- User-corrected portion weights can validate weight estimation but cannot validate hidden nutrient composition.
