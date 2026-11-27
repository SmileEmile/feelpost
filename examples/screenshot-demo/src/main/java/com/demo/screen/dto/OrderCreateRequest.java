package com.demo.screen.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

public class OrderCreateRequest {
    /** 客户编号 */
    @Schema(description = "客户编号", required = true)
    private String customerId;

    /** 商品明细 */
    @Schema(description = "商品明细", required = true)
    private List<OrderItem> items;

    /** 备注 */
    @Schema(description = "订单备注")
    private String remark;
}

class OrderItem {
    /** 商品编号 */
    private String skuId;
    /** 购买数量 */
    private Integer quantity;
}
