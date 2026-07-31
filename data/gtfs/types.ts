export type Stop = {
  stop_id: string;
  stop_code: string;
  stop_name: string;
  lat: number;
  lon: number;
};

export type RouteSummary = {
  route_id: string;
  short_name: string;
  long_name: string;
};

export type StopWithDistance = Stop & {
  meters: number;
};
