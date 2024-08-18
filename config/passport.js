const passport = require("passport");
const { Strategy: JwtStrategy, ExtractJwt } = require("passport-jwt");
const User = require("../models/user");
const redisClient = require("../utils/redisClient");

const opts = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: process.env.JWT_SECRET,
  passReqToCallback: true,
};

passport.use(
  new JwtStrategy(opts, async (req, jwt_payload, done) => {
    try {
      const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
      const isTokenBlacklisted = await redisClient.get(token);
      if (isTokenBlacklisted) {
        return done(null, false);
      }

      const user = await User.findByPk(jwt_payload.id);
      if (user) {
        return done(null, user);
      } else {
        return done(null, false);
      }
    } catch (err) {
      return done(err, false);
    }
  })
);

module.exports = passport;
