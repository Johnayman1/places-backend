const fs = require("fs");
const { v4: uuid } = require("uuid");
const { validationResult } = require("express-validator");
const getCoordsForAddress = require("../util/location");
const HttpError = require("../models/http-error");
const Place = require("../models/place");
const User = require("../models/user");
const { mongo, default: mongoose } = require("mongoose");
const place = require("../models/place");

const getPlaceById = async (req, res, next) => {
  const placeId = req.params.pid;
  let place;
  try {
    place = await Place.findById(placeId);
  } catch (err) {
    const error = new HttpError("Request fail!", 500);
    return next(error);
  }

  if (!place) {
    const error = new HttpError(
      "Could not find a place for the provided id",
      404,
    );
    return next(error);
  }
  res.json({ place: place.toObject({ getters: true }) });
};

const getPlacesByUserId = async (req, res, next) => {
  const userId = req.params.uid;
  let places;
  try {
    places = await Place.find({ creator: userId });
  } catch (err) {
    return next(new HttpError("Request fail!", 500));
  }

  if (!places || places.length === 0) {
    return next(
      new HttpError("Could not find a place for the provided user id", 404),
    );
  }
  res.json({
    places: places.map((p) => {
      return p.toObject({ getters: true });
    }),
  });
};

const createPlace = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(
      new HttpError("Invalid inputs passed, please check your data.", 422),
    );
  }
  const { title, description, address } = req.body;
  let coordinates;
  try {
    coordinates = await getCoordsForAddress(address);
  } catch (error) {
    return next(error);
  }
  const createdPlace = new Place({
    title,
    description,
    address,
    location: coordinates,
    image: req.file.path,
    creator: req.userData.userId,
  });

  let user;

  try {
    user = await User.findById(req.userData.userId);
  } catch (err) {
    console.log(err);
    const error = new HttpError("Creating place fail, please try again.", 500);
    return next(error);
  }

  if (!user) {
    const error = new HttpError(
      "Could not find user for the provided id, please try again.",
      404,
    );
    return next(error);
  }
  try {
    const sess = await mongoose.startSession();
    sess.startTransaction();
    await createdPlace.save({ session: sess });
    user.places.push(createdPlace);
    await user.save({ session: sess });
    await sess.commitTransaction();
  } catch (err) {
    console.log(err);
    const error = new HttpError("Creating place fail, please try again.", 500);
    return next(error);
  }

  res.status(201).json({ place: createdPlace });
};

const updatePlace = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(
      new HttpError("Invalid inputs passed, please check your data.", 422),
    );
  }
  const { title, description } = req.body;
  const placeId = req.params.pid;

  let updatePlace;

  try {
    updatePlace = await Place.findById(placeId);
  } catch (err) {
    const error = new HttpError("Update place fail, please try again.", 500);
    return next(error);
  }

  if (updatePlace.creator.toString() !== req.userData.userId) {
    const error = new HttpError("You are not allowed to edit this place.", 401);
    return next(error);
  }
  updatePlace.title = title;
  updatePlace.description = description;

  try {
    await updatePlace.save();
  } catch (err) {
    const error = new HttpError("Save place fail, please try again.", 500);
    return next(error);
  }

  res.status(200).json({ place: updatePlace.toObject({ getters: true }) });
};

const deletePlace = async (req, res, next) => {
  const placeId = req.params.pid;
  let place;

  try {
    place = await Place.findById(placeId).populate("creator");
  } catch (err) {
    const error = new HttpError("Delete place fail, please try again.", 500);
    return next(error);
  }

  if (!place) {
    const error = new HttpError(
      "Could not find place for this id, please try again.",
      404,
    );
    return next(error);
  }

  if (place.creator.id !== req.userData.userId) {
    const error = new HttpError("You are not allowed to edit this place.", 401);
    return next(error);
  }

  const imagePath = place.image;

  try {
    const sess = await mongoose.startSession();
    sess.startTransaction();
    await place.deleteOne({ session: sess });
    place.creator.places.pull(place);
    await place.creator.save({ session: sess });
    await sess.commitTransaction();
  } catch (err) {
    const error = new HttpError("Delete place fail, please try again.", 500);
    return next(error);
  }
  fs.unlink(imagePath, (err) => {
    console.log(err);
  });
  res.status(200).json({ message: "Deleted Successfully" });
};

exports.getPlaceById = getPlaceById;
exports.getPlacesByUserId = getPlacesByUserId;
exports.createPlace = createPlace;
exports.updatePlace = updatePlace;
exports.deletePlace = deletePlace;