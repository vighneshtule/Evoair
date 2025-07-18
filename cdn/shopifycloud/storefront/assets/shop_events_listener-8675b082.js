(() => {
  var AddToCartListener = class _AddToCartListener {
    static ADD_TO_CART_REGEX =
      /^(?:\/[a-zA-Z]+(?:-[a-zA-Z]+)?)?\/+cart\/+add(?:\.js|\.json)?\/*$/;
    static XHR_FALLBACK_STATE = {
      UNSENT: 0,
      OPENED: 1,
      HEADERS_RECEIVED: 2,
      LOADING: 3,
      DONE: 4,
    };
    static handleXhrOpen() {}
    constructor(xhr, url, method, body) {
      this.xhr = xhr;
      this.url = url;
      this.method = method;
      this.body = body;
    }
    onReadyStateChange() {
      if (this.xhr.readyState === _AddToCartListener.XHR_FALLBACK_STATE.DONE) {
        _AddToCartListener.handleXhrDone({
          method: this.method,
          url: this.url,
          body: this.body,
          xhr: this.xhr,
        });
      }
      if (this.oldOnReadyStateChange) {
        this.oldOnReadyStateChange();
      }
    }
    static handleXhrDone(payload) {
      if (payload.xhr.status >= 400) {
        return;
      }
      try {
        const hyperlinkElement = document.createElement("a");
        hyperlinkElement.href = payload.url;
        const path = hyperlinkElement.pathname
          ? hyperlinkElement.pathname
          : payload.url;
        if (_AddToCartListener.ADD_TO_CART_REGEX.test(path)) {
          _AddToCartListener._parsePayloadResponse(
            payload,
            (parsedResponse) => {
              try {
                handleAddResponse(parsedResponse, "xhr");
              } catch (error) {}
              const keys = Object.keys(parsedResponse);
              if (keys.length === 1 && keys[0] === "items") {
                const parsedResponseItemsList = parsedResponse.items;
                let parsedPayloadBodyItemsList;
                try {
                  parsedPayloadBodyItemsList = JSON.parse(payload.body).items;
                } catch (error) {
                  parsedPayloadBodyItemsList = parseFormEncodedBulkPayload(
                    payload.body,
                    parsedResponseItemsList.length
                  );
                }
                handleBulkItemCartAddResponse(
                  parsedResponseItemsList,
                  parsedPayloadBodyItemsList,
                  "add-xhr-bulk"
                );
              } else {
                handleItemAdded(
                  parsedResponse,
                  parseSingleItemQuantity(payload.body),
                  "add-xhr"
                );
              }
            }
          );
        }
      } catch (error) {
        if (console && console.warn) {
          console.warn(
            `[shop_events_listener] Error in handleXhrDone:  ${error.message}`
          );
        }
      }
    }
    static parseBlobToJson(blob, parsedPayloadHandler) {
      const reader = new FileReader();
      reader.addEventListener("loadend", () =>
        parsedPayloadHandler(
          JSON.parse(String.fromCharCode(...new Uint8Array(reader.result)))
        )
      );
      reader.readAsArrayBuffer(blob);
    }
    static _parsePayloadResponse(payload, parsedPayloadHandler) {
      if (payload.xhr.response instanceof Blob) {
        _AddToCartListener.parseBlobToJson(
          payload.xhr.response,
          parsedPayloadHandler
        );
      } else if (payload.xhr.responseText) {
        parsedPayloadHandler(JSON.parse(payload.xhr.responseText));
      }
    }
  };
  (function () {
    function addListener(element, type, callback) {
      if (window.jQuery && window.jQuery(element).bind) {
        window.jQuery(element).bind(type, callback);
      } else if (element.addEventListener) {
        element.addEventListener(type, callback);
      } else if (element.attachEvent) {
        element.attachEvent(`on${type}`, callback);
      }
    }
    function handleSubmitToCartAdd(event) {
      event = event || window.event;
      if (
        event.defaultPrevented ||
        (event.isDefaultPrevented && event.isDefaultPrevented())
      ) {
        return;
      }
      const target = event.target || event.srcElement;
      if (
        target &&
        (target.getAttribute("action") || target.getAttribute("href"))
      ) {
        try {
          let element;
          const idElement = target.id || target.elements.id;
          if (idElement.options) {
            element = idElement.options[idElement.selectedIndex];
          } else {
            element = idElement;
          }
          const cartToken = getCookie("cart");
          const variantId = element.value;
          const properties = trackProperties(variantId);
          properties.quantity = String(
            target.quantity ? target.quantity.value : 1
          );
          const eventProperties = extend({ cartToken }, properties);
          const monorailProperties = extend(
            { referer: window.location.href },
            properties
          );
          window.ShopifyAnalytics.lib.track(
            "Added Product",
            eventProperties,
            void 0,
            void 0,
            { addApiSource: "add-form", shopifyEmitted: true }
          );
          window.ShopifyAnalytics.lib.track(
            "monorail://trekkie_storefront_track_added_product/1.1",
            monorailProperties
          );
        } catch (error) {
          if (console && console.warn) {
            console.warn(
              `[shop_events_listener] Error in handleSubmitCartAdd: ${error.message}`
            );
          }
        }
      }
    }
    function handleSubmitToPaymentAdd(event) {
      event = event || window.event;
      const target = event.target || event.srcElement;
      if (
        target &&
        target.getAttribute("action") &&
        target.getAttribute("data-payment-form") !== null
      ) {
        try {
          window.ShopifyAnalytics.lib.track(
            "Added Payment",
            {
              currency: window.ShopifyAnalytics.meta.currency,
              total: window.ShopifyAnalytics.meta.checkout.payment_due / 100,
            },
            void 0,
            void 0,
            { shopifyEmitted: true }
          );
        } catch (error) {
          if (console && console.warn) {
            console.warn(
              `[shop_events_listener] Error in handleSubmitToPaymentAdd: ${error.message}`
            );
          }
        }
      }
    }
    function handleViewedProductVariant(event) {
      event = event || window.event;
      trackViewedProductVariant(event.currentTarget);
    }
    function trackViewedProductVariant(target) {
      try {
        let element;
        const idElement = target.id || target.elements.id;
        if (idElement.options && idElement.options[idElement.selectedIndex]) {
          element = idElement.options[idElement.selectedIndex];
        } else {
          element = idElement;
        }
        if (!element) {
          return;
        }
        const newVariantId = element.value;
        if (
          window.ShopifyAnalytics.meta.selectedVariantId &&
          window.ShopifyAnalytics.meta.selectedVariantId == newVariantId
        ) {
          return;
        }
        window.ShopifyAnalytics.meta.selectedVariantId = newVariantId;
        const properties = trackProperties(newVariantId);
        window.ShopifyAnalytics.lib.track(
          "Viewed Product Variant",
          properties,
          void 0,
          void 0,
          { shopifyEmitted: true }
        );
      } catch (error) {
        if (console && console.warn) {
          console.warn(
            `[shop_events_listener] Error in trackViewedProductVariant: ${error.message}`
          );
        }
      }
    }
    function trackProperties(variantId) {
      const productProperties = productTrackProperties(variantId);
      const pageProperties = pageTrackProperties();
      const result = extend(productProperties, pageProperties);
      result.currency = window.ShopifyAnalytics.meta.currency;
      return result;
    }
    function findProductAndVariantInCollection(variantId, products) {
      for (const product of products) {
        const variant = findProductVariant(variantId, product);
        if (variant) {
          return { product, variant };
        }
      }
    }
    function findProductVariant(variantId, product) {
      for (const variant of product.variants) {
        if (variant.id == variantId) {
          return variant;
        }
      }
    }
    function productTrackProperties(variantId) {
      let product;
      let productVariant;
      let result;
      if (window.ShopifyAnalytics.meta.products) {
        const products = window.ShopifyAnalytics.meta.products;
        ({ product, variant: productVariant } =
          findProductAndVariantInCollection(variantId, products));
      } else if (window.ShopifyAnalytics.meta.product) {
        product = window.ShopifyAnalytics.meta.product;
        productVariant = findProductVariant(variantId, product);
      }
      if (product) {
        result = {
          productId: product.id,
          productGid: product.gid,
          brand: product.vendor,
          category: product.type,
        };
        if (productVariant) {
          result = extend(result, {
            variantId,
            price: productVariant.price / 100,
            name: productVariant.name,
            sku: productVariant.sku,
            variant: productVariant.public_title,
          });
        }
      } else {
        result = { variantId };
      }
      return result;
    }
    window.addEventListener("load", () => {
      for (let i = 0; i < document.forms.length; i++) {
        const action = document.forms[i].getAttribute("action");
        if (action && action.indexOf("/cart/add") >= 0) {
          addListener(document.forms[i], "submit", handleSubmitToCartAdd);
          addListener(document.forms[i], "change", handleViewedProductVariant);
          trackViewedProductVariant(document.forms[i]);
        }
        const previousStep = document.forms[i].elements.previous_step;
        if (previousStep && previousStep.value === "payment_method") {
          addListener(document.body, "submit", handleSubmitToPaymentAdd);
        }
      }
    });
  })();
  (function (XHR) {
    const open = XHR.prototype.open;
    const send = XHR.prototype.send;
    XHR.prototype.open = function (method, url) {
      this._url = url;
      this._method = method;
      AddToCartListener.handleXhrOpen();
      open.apply(this, arguments);
    };
    XHR.prototype.send = function (data) {
      const addToCartListener = new AddToCartListener(
        this,
        this._url,
        this._method,
        data
      );
      if (this.addEventListener) {
        this.addEventListener(
          "readystatechange",
          addToCartListener.onReadyStateChange.bind(addToCartListener),
          false
        );
      } else {
        addToCartListener.oldOnReadyStateChange = this.onreadystatechange;
        this.onreadystatechange = addToCartListener.onReadyStateChange;
      }
      send.call(this, data);
    };
  })(XMLHttpRequest);
  (function (window2, fetch) {
    if (typeof fetch === "function") {
      window2.fetch = function () {
        return fetch
          .apply(this, Array.prototype.slice.call(arguments))
          .then((response) => {
            if (!response.ok) {
              return response;
            }
            const hyperlinkElement = document.createElement("a");
            hyperlinkElement.href = response.url;
            const path = hyperlinkElement.pathname
              ? hyperlinkElement.pathname
              : response.url;
            try {
              if (AddToCartListener.ADD_TO_CART_REGEX.test(path)) {
                try {
                  handleFetchAddToCart(response, arguments[1].body);
                } catch (error) {}
              }
            } catch (error) {
              consoleWarn(error);
            }
            return response;
          });
      };
    }
    function handleFetchAddToCart(response, requestBody) {
      response
        .clone()
        .json()
        .then((responseJson) => {
          if (
            Object.prototype.toString.call(responseJson) !== "[object Object]"
          ) {
            return;
          }
          try {
            handleAddResponse(responseJson, "fetch");
          } catch (error) {}
          if (responseJson.items) {
            const parsedPayloadBodyItemsList =
              parseRequestBody(requestBody).items;
            const parsedResponseItemsList = responseJson.items;
            handleBulkItemCartAddResponse(
              parsedResponseItemsList,
              parsedPayloadBodyItemsList,
              "add-fetch-bulk"
            );
            return;
          }
          const quantity = parseSingleItemQuantity(requestBody);
          handleItemAdded(responseJson, quantity, "add-fetch");
        })
        .catch(consoleWarn);
    }
    function consoleWarn(error) {
      if (console && console.warn) {
        console.warn(
          `[shop_events_listener] Error in handleFetchRequest:  ${error.message}`
        );
      }
    }
  })(window, window.fetch);
  function handleAddResponse(response, apiSource) {
    const itemsAdded =
      response && response.items_changelog && response.items_changelog.added;
    if (!itemsAdded || !Array.isArray(itemsAdded)) {
      return;
    }
    const isBulkAdd = Array.isArray(response.items);
    const addApiSource = `add-${apiSource}${isBulkAdd ? "-bulk" : ""}`;
    const itemsInCart = isBulkAdd ? response.items : [response];
    const itemsAddedWithPayload = itemsAdded
      .map((addedItem) => {
        const matchedItem = itemsInCart.find((item) => {
          return (
            String(item.variant_id || item.id) === String(addedItem.variant_id)
          );
        });
        if (matchedItem) {
          const result = {};
          for (const prop in matchedItem) {
            if (matchedItem.hasOwnProperty(prop)) {
              result[prop] = matchedItem[prop];
            }
          }
          result.quantity = addedItem.quantity;
          return result;
        }
        return null;
      })
      .filter(Boolean);
    itemsAddedWithPayload.forEach((item) => {
      handleItemAddedServerSideChangelogTest(item, item.quantity, addApiSource);
    });
  }
  function handleBulkItemCartAddResponse(
    parsedResponseItemsList,
    parsedPayloadBodyItemsList,
    addApiSource
  ) {
    if (parsedResponseItemsList.length != parsedPayloadBodyItemsList.length) {
      throw Error("Payload body and response have different number of items");
    }
    parsedResponseItemsList.forEach((item, idx) => {
      let quantity = 1;
      try {
        quantity = parseInt(parsedPayloadBodyItemsList[idx].quantity, 10) || 1;
      } catch (error) {
        if (console && console.warn) {
          console.warn(
            `[shop_events_listener] Error in handleBulkItemCartAddResponse: ${error.message}`
          );
        }
      }
      handleItemAdded(item, quantity, addApiSource);
    });
  }
  function parseFormEncodedBulkPayload(body, size) {
    const parsedPayloadBodyItems = new Array(size);
    for (let i = 0; i < size; i++) {
      parsedPayloadBodyItems[i] = {};
    }
    for (const entry of decodeURI(body).split("&")) {
      const pair = entry.split("=");
      const matches = pair[0].match(/items\[(\d+)\]\[(\w+)\].*/);
      if (matches) {
        const index = matches[1];
        const field = matches[2];
        if (field === "quantity") {
          parsedPayloadBodyItems[index].quantity = pair[1];
        } else if (field === "id") {
          parsedPayloadBodyItems[index].id = pair[1];
        }
      }
    }
    return parsedPayloadBodyItems;
  }
  function parseSingleItemQuantity(body) {
    if (!body) {
      return 1;
    }
    try {
      return JSON.parse(body).quantity || 1;
    } catch (error) {
      if (body instanceof FormData) {
        if (body.has("quantity")) {
          return body.get("quantity");
        }
      } else {
        const vars = body.split("&");
        for (let i = 0; i < vars.length; i++) {
          const pair = vars[i].split("=");
          if (pair[0] === "quantity") {
            return pair[1];
          }
        }
      }
    }
    return 1;
  }
  function parseRequestBody(body) {
    if (body instanceof FormData) {
      return parseFormData(body);
    } else {
      return JSON.parse(body);
    }
  }
  function parseFormData(formData) {
    const itemsMap = new Map();
    const nonIndexedKey = "nonIndexed";
    for (const entry of formData.entries()) {
      const key = entry[0];
      const value = entry[1];
      const match = key.match(/items\[(\d*)\]\[(\w+)\]/);
      if (!match) {
        continue;
      }
      const index = match[1];
      const field = match[2];
      const itemKey = index === "" ? nonIndexedKey : index;
      const currentItem = itemsMap.get(itemKey) || {};
      currentItem[field] = value;
      itemsMap.set(itemKey, currentItem);
    }
    const uniqueItems = {};
    for (const entry of itemsMap.entries()) {
      const item = entry[1];
      if (!item.id) {
        continue;
      }
      const existingItem = uniqueItems[item.id];
      if (existingItem) {
        existingItem.quantity = (
          parseInt(existingItem.quantity || "1", 10) +
          parseInt(item.quantity || "1", 10)
        ).toString();
      } else {
        uniqueItems[item.id] = item;
      }
    }
    return { items: Object.values(uniqueItems) };
  }
  function handleItemAdded(item, quantity, addApiSource) {
    const cartToken = getCookie("cart");
    const properties = extend(
      {
        variantId: String(item.id),
        productId: item.product_id,
        currency: window.ShopifyAnalytics.meta.currency,
        quantity: String(quantity ? quantity : 1),
        price: item.presentment_price,
        name: item.title,
        sku: item.sku,
        brand: item.vendor,
        variant: item.variant_title,
        category: item.product_type,
      },
      pageTrackProperties()
    );
    const eventProperties = extend({ cartToken }, properties);
    window.ShopifyAnalytics.lib.track(
      "Added Product",
      eventProperties,
      void 0,
      void 0,
      { addApiSource, shopifyEmitted: true }
    );
    const monorailProperties = extend(
      { referer: window.location.href },
      properties
    );
    window.ShopifyAnalytics.lib.track(
      "monorail://trekkie_storefront_track_added_product/1.1",
      monorailProperties
    );
  }
  function handleItemAddedServerSideChangelogTest(
    item,
    quantity,
    addApiSource
  ) {
    const cartToken = getCookie("cart");
    const properties = extend(
      {
        variantId: String(item.id),
        productId: item.product_id,
        currency: window.ShopifyAnalytics.meta.currency,
        quantity: String(quantity ? quantity : 1),
        price: item.presentment_price,
        name: item.title,
        sku: item.sku,
        brand: item.vendor,
        variant: item.variant_title,
        category: item.product_type,
      },
      pageTrackProperties()
    );
    const eventProperties = extend({ cartToken }, properties);
    window.ShopifyAnalytics.lib.track(
      "test_product_added_to_cart_server_changelog",
      eventProperties,
      void 0,
      void 0,
      { addApiSource, shopifyEmitted: true }
    );
  }
  function pageTrackProperties() {
    let result = {};
    if (window.ShopifyAnalytics.meta.page) {
      result = {
        pageType: window.ShopifyAnalytics.meta.page.pageType,
        resourceType: window.ShopifyAnalytics.meta.page.resourceType,
        resourceId: window.ShopifyAnalytics.meta.page.resourceId,
      };
    }
    return result;
  }
  function extend(obj, src) {
    for (const key in src) {
      if (src.hasOwnProperty(key)) {
        obj[key] = src[key];
      }
    }
    return obj;
  }
  function getCookie(key) {
    try {
      const value = new RegExp(`(${key})=([^;]+)`).exec(document.cookie);
      return value ? unescape(value[2]) : null;
    } catch (_err) {
      return null;
    }
  }
})();
