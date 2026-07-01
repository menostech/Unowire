from app.crud.base import CRUDBase
from app.models.manufacturer import Manufacturer
from app.schemas.manufacturer import ManufacturerCreate, ManufacturerUpdate


class CRUDManufacturer(CRUDBase[Manufacturer, ManufacturerCreate, ManufacturerUpdate]):
    pass


crud_manufacturer = CRUDManufacturer(Manufacturer)
