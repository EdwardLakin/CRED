'use client'

import { useState } from 'react'

const LOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 30_000,
  timeout: 10_000,
}

function toLocalDateTimeValue(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

function getInput(form: HTMLFormElement, name: string) {
  return form.elements.namedItem(name) instanceof HTMLInputElement || form.elements.namedItem(name) instanceof HTMLTextAreaElement
    ? (form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement)
    : null
}

function setInputValue(form: HTMLFormElement, name: string, value: string) {
  const input = getInput(form, name)
  if (input) input.value = value
}

function getNumberValue(form: HTMLFormElement, name: string) {
  const input = getInput(form, name)
  if (!input) return null
  const value = Number(input.value)
  return Number.isFinite(value) ? value : null
}

function formatNumber(value: number) {
  return Number.isFinite(value) ? String(Math.round(value * 100) / 100) : ''
}

function haversineDistanceKm(startLat: number, startLng: number, endLat: number, endLng: number) {
  const earthRadiusKm = 6371
  const toRadians = (value: number) => (value * Math.PI) / 180
  const dLat = toRadians(endLat - startLat)
  const dLng = toRadians(endLng - startLng)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(startLat)) * Math.cos(toRadians(endLat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

async function getOptionalPosition() {
  if (!('geolocation' in navigator)) return null

  return new Promise<GeolocationPosition | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), LOCATION_OPTIONS)
  })
}

function maybePromptForOdometer(form: HTMLFormElement, field: string, promptText: string) {
  const input = getInput(form, field)
  if (!input || input.value.trim()) return
  const value = window.prompt(promptText)
  if (value?.trim()) input.value = value.trim()
}

function updateTravelDistances(form: HTMLFormElement) {
  const startOdo = getNumberValue(form, 'travel_start_odometer')
  const endOdo = getNumberValue(form, 'travel_end_odometer')
  const startLat = getNumberValue(form, 'gps_start_lat')
  const startLng = getNumberValue(form, 'gps_start_lng')
  const endLat = getNumberValue(form, 'gps_end_lat')
  const endLng = getNumberValue(form, 'gps_end_lng')
  const manualDistance = getNumberValue(form, 'kilometers_traveled')

  if (startOdo !== null && endOdo !== null && endOdo >= startOdo) {
    setInputValue(form, 'kilometers_traveled', formatNumber(endOdo - startOdo))
    setInputValue(form, 'gps_distance_source', 'odometer')
  } else if (manualDistance !== null) {
    setInputValue(form, 'gps_distance_source', 'manual')
  }

  if (startLat !== null && startLng !== null && endLat !== null && endLng !== null) {
    setInputValue(form, 'gps_distance_km', formatNumber(haversineDistanceKm(startLat, startLng, endLat, endLng)))
    if (!(startOdo !== null && endOdo !== null && endOdo >= startOdo) && manualDistance === null) {
      setInputValue(form, 'kilometers_traveled', formatNumber(haversineDistanceKm(startLat, startLng, endLat, endLng)))
      setInputValue(form, 'gps_distance_source', 'gps')
    }
  }
}

function updateHours(form: HTMLFormElement) {
  const setHoursBetween = (startField: string, endField: string, outputField: string) => {
    const start = getInput(form, startField)?.value
    const end = getInput(form, endField)?.value
    if (!start || !end) return null
    const startDate = new Date(start)
    const endDate = new Date(end)
    const hours = (endDate.getTime() - startDate.getTime()) / 3_600_000
    if (Number.isFinite(hours) && hours >= 0) {
      setInputValue(form, outputField, formatNumber(hours))
      return hours
    }
    return null
  }

  const travelHours = setHoursBetween('travel_started_at', 'travel_ended_at', 'travel_time_hours')
  const workHours = setHoursBetween('work_started_at', 'work_ended_at', 'working_time_hours')
  const overtime = getNumberValue(form, 'overtime_hours') ?? 0
  const doubleTime = getNumberValue(form, 'double_time_hours') ?? 0
  const total = (travelHours ?? getNumberValue(form, 'travel_time_hours') ?? 0) + (workHours ?? getNumberValue(form, 'working_time_hours') ?? 0) + overtime + doubleTime
  if (total > 0) setInputValue(form, 'total_hours', formatNumber(total))
}

function submitContainingForm(button: HTMLButtonElement) {
  const form = button.form
  if (!form) return
  updateTravelDistances(form)
  updateHours(form)
  form.requestSubmit()
}

export function TravelWorkflowControls() {
  const [message, setMessage] = useState('GPS is optional and only start/end points are stored.')

  async function handleStartTravel(event: React.MouseEvent<HTMLButtonElement>) {
    const form = event.currentTarget.form
    if (!form) return
    setInputValue(form, 'travel_started_at', toLocalDateTimeValue(new Date()))
    maybePromptForOdometer(form, 'travel_start_odometer', 'Optional start odometer reading:')
    const position = await getOptionalPosition()
    if (position) {
      setInputValue(form, 'gps_start_lat', String(position.coords.latitude))
      setInputValue(form, 'gps_start_lng', String(position.coords.longitude))
      setMessage('Travel started. GPS start point captured.')
    } else {
      setMessage('Travel started. GPS was unavailable or denied; odometer/manual entries still work.')
    }
    submitContainingForm(event.currentTarget)
  }

  async function handleEndTravel(event: React.MouseEvent<HTMLButtonElement>) {
    const form = event.currentTarget.form
    if (!form) return
    setInputValue(form, 'travel_ended_at', toLocalDateTimeValue(new Date()))
    maybePromptForOdometer(form, 'travel_end_odometer', 'Optional end odometer reading:')
    const position = await getOptionalPosition()
    if (position) {
      setInputValue(form, 'gps_end_lat', String(position.coords.latitude))
      setInputValue(form, 'gps_end_lng', String(position.coords.longitude))
      setMessage('Travel ended. GPS end point captured; odometer distance remains the source of truth when entered.')
    } else {
      setMessage('Travel ended. GPS was unavailable or denied; odometer/manual entries still work.')
    }
    submitContainingForm(event.currentTarget)
  }

  function handleStartWork(event: React.MouseEvent<HTMLButtonElement>) {
    const form = event.currentTarget.form
    if (!form) return
    setInputValue(form, 'work_started_at', toLocalDateTimeValue(new Date()))
    setMessage('Work started.')
    submitContainingForm(event.currentTarget)
  }

  function handleEndWork(event: React.MouseEvent<HTMLButtonElement>) {
    const form = event.currentTarget.form
    if (!form) return
    setInputValue(form, 'work_ended_at', toLocalDateTimeValue(new Date()))
    updateHours(form)
    setMessage('Work ended. Working time calculated when start/end values are present.')
    submitContainingForm(event.currentTarget)
  }

  return (
    <div className="gps-workflow-panel">
      <div className="gps-workflow-actions">
        <button type="button" className="button button-secondary touch-target" onClick={handleStartTravel}>
          Start Travel
        </button>
        <button type="button" className="button button-secondary touch-target" onClick={handleEndTravel}>
          End Travel
        </button>
        <button type="button" className="button button-secondary touch-target" onClick={handleStartWork}>
          Start Work
        </button>
        <button type="button" className="button button-secondary touch-target" onClick={handleEndWork}>
          End Work
        </button>
      </div>
      <p className="muted gps-workflow-message">{message}</p>
    </div>
  )
}
