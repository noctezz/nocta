-- Ambilight de NOCTA : quelques fois par seconde, mpv prend l'image en cours (sans les
-- sous-titres), en mesure la couleur moyenne le long des bords, et l'envoie à NOCTA qui
-- dessine le halo lumineux autour de la vidéo.
-- Message envoyé : script-message nocta-ambi "<haut>|<droite>|<bas>|<gauche>" (couleurs rrggbb)

local COLS, ROWS = 10, 6 -- zones le long des bords horizontaux / verticaux
local enabled = false
local timer = nil

local function hex(r, g, b)
  return string.format('%02x%02x%02x', math.floor(r), math.floor(g), math.floor(b))
end

local function sample()
  local shot = mp.command_native({ 'screenshot-raw', 'video' })
  if not shot or not shot.data or not shot.w or shot.w < 16 then return end
  local w, h, stride, data = shot.w, shot.h, shot.stride, shot.data
  local bgr = shot.format ~= 'rgba' and shot.format ~= 'rgb0'
  local byte = string.byte

  local function px(x, y)
    local o = y * stride + x * 4 + 1
    local a, b, c = byte(data, o, o + 2)
    if not c then return 0, 0, 0 end
    if bgr then return c, b, a end
    return a, b, c
  end

  -- Bandes noires incrustées dans l'image : on cherche où commence vraiment l'image
  local function rowLuma(y)
    local s = 0
    for i = 1, 16 do
      local r, g, b = px(math.floor((i - 0.5) * w / 16), y)
      s = s + 0.3 * r + 0.59 * g + 0.11 * b
    end
    return s / 16
  end
  local top, bottom = 0, h - 1
  local limit = math.floor(h * 0.25)
  while top < limit and rowLuma(top) < 14 do top = top + math.max(1, math.floor(h / 120)) end
  while bottom > h - 1 - limit and rowLuma(bottom) < 14 do bottom = bottom - math.max(1, math.floor(h / 120)) end
  if bottom - top < h * 0.3 then top, bottom = 0, h - 1 end
  local ch = bottom - top

  -- Couleur moyenne d'un rectangle (pixels presque noirs ignorés, couleurs vives favorisées)
  local function zone(x0, y0, x1, y1)
    local sr, sg, sb, n = 0, 0, 0, 0
    local nx, ny = 7, 5
    for i = 0, nx - 1 do
      for j = 0, ny - 1 do
        local x = math.floor(x0 + (i + 0.5) * (x1 - x0) / nx)
        local y = math.floor(y0 + (j + 0.5) * (y1 - y0) / ny)
        local r, g, b = px(math.min(w - 1, x), math.min(h - 1, y))
        local mx = math.max(r, g, b)
        if mx > 10 then
          local wt = 1 + (mx - math.min(r, g, b)) / 64
          sr, sg, sb, n = sr + r * wt, sg + g * wt, sb + b * wt, n + wt
        end
      end
    end
    if n == 0 then return '000000' end
    return hex(sr / n, sg / n, sb / n)
  end

  local depthY, depthX = ch * 0.14, w * 0.10
  local t, bt, l, rt = {}, {}, {}, {}
  for i = 0, COLS - 1 do
    local x0, x1 = i * w / COLS, (i + 1) * w / COLS
    t[#t + 1] = zone(x0, top, x1, top + depthY)
    bt[#bt + 1] = zone(x0, bottom - depthY, x1, bottom)
  end
  for j = 0, ROWS - 1 do
    local y0, y1 = top + j * ch / ROWS, top + (j + 1) * ch / ROWS
    l[#l + 1] = zone(0, y0, depthX, y1)
    rt[#rt + 1] = zone(w - depthX, y0, w - 1, y1)
  end
  mp.commandv('script-message', 'nocta-ambi', table.concat(t, ',') .. '|' .. table.concat(rt, ',') .. '|' .. table.concat(bt, ',') .. '|' .. table.concat(l, ','))
end

local function tick()
  if not enabled then return end
  if mp.get_property_native('idle-active') then return end
  pcall(sample)
end

local function setEnabled(v)
  enabled = v == '1' or v == 'yes'
  if timer then timer:kill(); timer = nil end
  if enabled then
    timer = mp.add_periodic_timer(0.12, function()
      -- En pause, l'image ne change pas : une mesure de temps en temps suffit
      if mp.get_property_native('pause') and math.random() > 0.15 then return end
      tick()
    end)
    tick()
  end
end

mp.register_script_message('nocta-ambi-enable', setEnabled)
-- Nouvelle image après un saut dans la vidéo : mesure immédiate
mp.register_event('playback-restart', tick)
